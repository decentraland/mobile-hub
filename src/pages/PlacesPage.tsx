import { useCallback, useEffect, useMemo, useState, type FC, type FormEvent } from 'react'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'
import { config } from '../config'
import {
  createPlace,
  fetchAllPlaces,
  fetchAllTags,
  fetchBackofficePlaces,
  updatePlace,
} from '../features/places/placesApi'
import type { Place } from '../features/places/types'
import { fetchScenesForPlaces, searchScenes, SEARCH_PAGE_SIZE } from '../features/scenes/api'
import { csvFilename, downloadCsv, placesCsv } from '../features/scenes/csv'
import {
  APP_TAGS,
  FEATURED_TAG,
  FTUE_TAG,
  IOS_ALLOWED_TAG,
  IOS_BANNED_TAG,
  MIN_SEARCH_LENGTH,
  featuredOutsideIos,
  hasOwnControl,
  indexPlaces,
  inventoryRows,
  iosRuleBlock,
  iosStatus,
  isIosTag,
  isSearchable,
  listSource,
  matchesFilter,
  matchesScope,
  matchesText,
  normalizeTag,
  placeInputFor,
  placesSiteUrl,
  refreshRow,
  rowBasePosition,
  rowParcelCount,
  rowTags,
  rowTitle,
  rowWorldName,
  sameTags,
  sortTagsForFilter,
  tagCounts,
  toRow,
  withFlag,
  withIosStatus,
  withTag,
  withoutTag,
  type SceneInfo,
  type SceneRow,
  type SceneScope,
  type TagFilter,
} from '../features/scenes/model'
import './PlacesPage.css'

const SEARCH_DEBOUNCE_MS = 300
const BULK_CONCURRENCY = 4
const TAG_OPTIONS_ID = 'places-tag-options'
const SITE_ORIGIN = siteOrigin()
const NO_KEYS: ReadonlySet<string> = new Set()
const NO_ROWS: ReadonlyMap<string, SceneRow> = new Map()
const TAG_MEANING = new Map(APP_TAGS.map(({ tag, meaning }) => [tag, meaning]))

// The Places site lives next to the auth app: decentraland.org in production, .zone in dev
function siteOrigin(): string {
  try {
    return new URL(config.get('AUTH_URL')).origin
  } catch {
    return 'https://decentraland.org'
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function upsertPlace(places: Place[], saved: Place): Place[] {
  return places.some(p => p.id === saved.id)
    ? places.map(p => (p.id === saved.id ? saved : p))
    : [...places, saved]
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return results
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

type BulkAction =
  | { kind: 'ios'; status: 'allowed' | 'banned' | 'unset' }
  | { kind: 'add'; tag: string }
  | { kind: 'remove'; tag: string }

type BulkState =
  | { status: 'idle' }
  | { status: 'confirming'; action: BulkAction }
  | { status: 'running'; done: number; total: number }
  | { status: 'finished'; saved: number; failed: number }

function applyBulkAction(action: BulkAction, tags: string[]): string[] {
  if (action.kind === 'ios') return withIosStatus(tags, action.status)
  if (action.kind === 'add') return withTag(tags, action.tag)
  return withoutTag(tags, action.tag)
}

function describeBulkAction(action: BulkAction, count: number): string {
  const places = plural(count, 'place')
  if (action.kind === 'ios') {
    if (action.status === 'allowed') return `Allow ${places} on iOS?`
    if (action.status === 'banned') return `Ban ${places} on iOS?`
    return `Clear the iOS status of ${places}?`
  }
  if (action.kind === 'add') return `Add “${action.tag}” to ${places}?`
  return `Remove “${action.tag}” from ${places}?`
}

interface SearchState {
  key: string
  scenes: SceneInfo[]
  total: number
  nextOffset: number
  error: string | null
}

interface InventoryState {
  key: string
  places: Place[] | null
  error: string | null
}

export const PlacesPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  // ----- Every scene the BFF holds tags for -----
  const [reloadCount, setReloadCount] = useState(0)
  const inventoryKey = `${canEdit ? 'backoffice' : 'public'}:${reloadCount}`
  const [inventory, setInventory] = useState<InventoryState>({ key: '', places: null, error: null })
  const inventoryLoading = inventory.key !== inventoryKey
  const places = inventoryLoading ? null : inventory.places
  const [tagCatalog, setTagCatalog] = useState<string[]>([])
  // What the Places API says about the scenes we have seen, keyed by scene
  const [knownScenes, setKnownScenes] = useState<ReadonlyMap<string, SceneInfo>>(new Map())
  const [details, setDetails] = useState<'loading' | 'ready' | 'failed'>('loading')

  const rememberScenes = useCallback((scenes: SceneInfo[]) => {
    if (scenes.length === 0) return
    setKnownScenes(prev => {
      const next = new Map(prev)
      for (const scene of scenes) next.set(scene.key, scene)
      return next
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = canEdit ? fetchBackofficePlaces(authenticatedFetch) : fetchAllPlaces()
    load
      .then(loaded => {
        if (controller.signal.aborted) return
        setInventory({ key: inventoryKey, places: loaded, error: null })
        setDetails('loading')
        return fetchScenesForPlaces(loaded, controller.signal).then(({ scenes, complete }) => {
          if (controller.signal.aborted) return
          rememberScenes(scenes)
          setDetails(complete ? 'ready' : 'failed')
        })
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setInventory({ key: inventoryKey, places: null, error: errorMessage(err, 'Failed to load scenes') })
      })
    return () => controller.abort()
  }, [canEdit, authenticatedFetch, inventoryKey, rememberScenes])

  useEffect(() => {
    let cancelled = false
    fetchAllTags()
      .then(tags => {
        if (!cancelled) setTagCatalog(tags.map(t => t.name))
      })
      .catch(() => {
        // Suggestions only: the tags on the scenes themselves still show
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ----- Filters -----
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const [scope, setScope] = useState<SceneScope>('all')
  const [filter, setFilter] = useState<TagFilter>({ kind: 'all' })
  const source = listSource(debouncedQuery, filter)
  const filterKey = filter.kind === 'tag' ? `tag:${filter.tag}` : filter.kind
  // Selection and "keep the row I just edited on screen" both belong to one view of the list
  const viewKey = [source, debouncedQuery.trim(), scope, filterKey].join('|')

  // ----- Global search through the Places API -----
  const searchKey = source === 'search' ? `${scope}|${debouncedQuery.trim()}` : null
  const [search, setSearch] = useState<SearchState | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const currentSearch = search && search.key === searchKey ? search : null
  const searchLoading = searchKey !== null && currentSearch === null

  useEffect(() => {
    if (searchKey === null) return
    const controller = new AbortController()
    searchScenes(debouncedQuery, scope, 0, controller.signal)
      .then(result => {
        setSearch({ key: searchKey, ...result, nextOffset: SEARCH_PAGE_SIZE, error: null })
        rememberScenes(result.scenes)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setSearch({ key: searchKey, scenes: [], total: 0, nextOffset: 0, error: errorMessage(err, 'Search failed') })
      })
    return () => controller.abort()
  }, [searchKey, debouncedQuery, scope, rememberScenes])

  const handleLoadMore = async () => {
    if (!currentSearch || searchKey === null) return
    const key = searchKey
    setLoadingMore(true)
    try {
      const result = await searchScenes(debouncedQuery, scope, currentSearch.nextOffset)
      rememberScenes(result.scenes)
      setSearch(prev => {
        if (!prev || prev.key !== key) return prev
        const seen = new Set(prev.scenes.map(s => s.key))
        return {
          ...prev,
          scenes: [...prev.scenes, ...result.scenes.filter(s => !seen.has(s.key))],
          total: result.total,
          nextOffset: prev.nextOffset + SEARCH_PAGE_SIZE,
        }
      })
    } catch (err) {
      setSearch(prev => (prev && prev.key === key ? { ...prev, error: errorMessage(err, 'Search failed') } : prev))
    } finally {
      setLoadingMore(false)
    }
  }

  // ----- Rows -----
  const index = useMemo(() => indexPlaces(places ?? []), [places])
  const rows = useMemo(
    () =>
      source === 'search'
        ? (currentSearch?.scenes ?? []).map(info => toRow(info, index))
        : inventoryRows(places ?? [], knownScenes.values()),
    [source, currentSearch, index, places, knownScenes]
  )

  const [sticky, setSticky] = useState<{ view: string; keys: ReadonlySet<string> }>({ view: '', keys: NO_KEYS })
  const stickyKeys = sticky.view === viewKey ? sticky.keys : NO_KEYS

  const visibleRows = useMemo(
    () =>
      rows.filter(
        row =>
          matchesScope(row, scope) &&
          (source === 'search' || matchesText(row, debouncedQuery)) &&
          // A row edited here stays put until the filters change, so a misclick can be undone
          (stickyKeys.has(row.key) || matchesFilter(row, filter))
      ),
    [rows, scope, source, debouncedQuery, stickyKeys, filter]
  )

  const counts = useMemo(() => tagCounts(places ?? [], scope), [places, scope])
  // Every tag, the ones the apps read first, so the list doubles as the tag inventory
  const allTags = useMemo(() => {
    const names = new Set([...tagCatalog, ...APP_TAGS.map(({ tag }) => tag)])
    places?.forEach(p => p.tags.forEach(t => names.add(t)))
    return sortTagsForFilter(names, counts)
  }, [tagCatalog, places, counts])

  // Writing needs the BFF records: without them a tagged scene would look untagged
  const canWrite = canEdit && places !== null

  // ----- Writes -----
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(NO_KEYS)
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(new Map())

  const commitRow = useCallback(
    async (row: SceneRow, nextTags: string[]): Promise<boolean> => {
      setSticky(prev => ({ view: viewKey, keys: new Set(prev.view === viewKey ? prev.keys : []).add(row.key) }))
      setPendingKeys(prev => new Set(prev).add(row.key))
      setRowErrors(prev => {
        if (!prev.has(row.key)) return prev
        const next = new Map(prev)
        next.delete(row.key)
        return next
      })
      try {
        const saved = row.place
          ? await updatePlace(authenticatedFetch, row.place.id, { tags: nextTags })
          : await createPlace(authenticatedFetch, placeInputFor(row, nextTags))
        setInventory(prev => (prev.places ? { ...prev, places: upsertPlace(prev.places, saved) } : prev))
        return true
      } catch (err) {
        setRowErrors(prev => new Map(prev).set(row.key, errorMessage(err, 'Failed to save tags')))
        return false
      } finally {
        setPendingKeys(prev => {
          const next = new Set(prev)
          next.delete(row.key)
          return next
        })
      }
    },
    [authenticatedFetch, viewKey]
  )

  const handleSetTags = (row: SceneRow, nextTags: string[]) => {
    if (sameTags(nextTags, rowTags(row))) return
    void commitRow(row, nextTags)
  }

  // ----- Selection and bulk actions -----
  const [selection, setSelection] = useState<{ view: string; rows: ReadonlyMap<string, SceneRow> }>({
    view: '',
    rows: NO_ROWS,
  })
  const selected = selection.view === viewKey ? selection.rows : NO_ROWS
  const [bulk, setBulk] = useState<BulkState>({ status: 'idle' })

  const toggleSelected = (row: SceneRow) => {
    const next = new Map(selected)
    if (next.has(row.key)) next.delete(row.key)
    else next.set(row.key, row)
    setSelection({ view: viewKey, rows: next })
    if (bulk.status === 'finished') setBulk({ status: 'idle' })
  }

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.key))
  const toggleSelectAll = () => {
    setSelection({
      view: viewKey,
      rows: allVisibleSelected ? NO_ROWS : new Map(visibleRows.map(row => [row.key, row])),
    })
    if (bulk.status === 'finished') setBulk({ status: 'idle' })
  }

  const clearSelection = () => {
    setSelection({ view: viewKey, rows: NO_ROWS })
    setBulk({ status: 'idle' })
  }

  const selectedRows = useMemo(
    () => [...selected.values()].map(row => refreshRow(row, places ?? [], index)),
    [selected, places, index]
  )
  const removableTags = useMemo(() => {
    const names = new Set<string>()
    selectedRows.forEach(row => rowTags(row).forEach(t => names.add(t)))
    return [...names].filter(t => !isIosTag(t)).sort()
  }, [selectedRows])

  const runBulk = async (action: BulkAction) => {
    const work = selectedRows.filter(row => !sameTags(applyBulkAction(action, rowTags(row)), rowTags(row)))
    setBulk({ status: 'running', done: 0, total: work.length })
    const results = await runWithConcurrency(work, BULK_CONCURRENCY, async row => {
      const ok = await commitRow(row, applyBulkAction(action, rowTags(row)))
      setBulk(prev => (prev.status === 'running' ? { ...prev, done: prev.done + 1 } : prev))
      return ok
    })
    const failed = results.filter(ok => !ok).length
    setBulk({ status: 'finished', saved: results.length - failed, failed })
  }

  // ----- Filter handlers -----
  const selectTag = (tag: string) => {
    setFilter(prev => (prev.kind === 'tag' && prev.tag === tag ? { kind: 'all' } : { kind: 'tag', tag }))
  }
  const toggleIosUnset = () => {
    setFilter(prev => (prev.kind === 'ios-unset' ? { kind: 'all' } : { kind: 'ios-unset' }))
  }
  const hasFilters = scope !== 'all' || filter.kind !== 'all'
  const clearFilters = () => {
    setScope('all')
    setFilter({ kind: 'all' })
  }

  const handleExport = () => {
    downloadCsv(placesCsv(visibleRows), csvFilename(filter, new Date()))
  }

  return (
    <div className="places-page">
      <div className="places-container">
        <header className="places-header">
          <h1>Places</h1>
          <p>
            Every place in Genesis City and in Worlds, and the tags the apps read:{' '}
            <code>{IOS_ALLOWED_TAG}</code> and <code>{IOS_BANNED_TAG}</code> decide what the iOS
            app lists, <code>{FEATURED_TAG}</code> fills the Discover carousel and{' '}
            <code>{FTUE_TAG}</code> the first-time one. Any other tag works for your own lists.
            With the iOS block list on, casinos and places rated A or R show as Blocked on iOS
            unless they are Allowed.
          </p>
          {!canEdit && (
            <div className="places-warning">Sign in with an allowed wallet to tag places.</div>
          )}
          {inventory.error && !inventoryLoading && (
            <div className="places-error">
              {inventory.error}{' '}
              <button className="places-link-button" onClick={() => setReloadCount(c => c + 1)}>
                Retry
              </button>
            </div>
          )}
        </header>

        <div className="places-toolbar">
          <input
            type="search"
            className="places-search-input"
            aria-label="Search places"
            placeholder="Search by name, world (name.dcl.eth) or parcel (x,y)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />

          <div className="places-filter-row">
            <Segmented
              label="Where"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'All' },
                { value: 'genesis', label: 'Genesis City' },
                { value: 'world', label: 'Worlds' },
              ]}
            />
          </div>

          <div className="places-tag-filters" role="group" aria-label="Filter by tag">
            <span className="places-filter-label">Tags</span>
            {allTags.map(tag => {
              const active = filter.kind === 'tag' && filter.tag === tag
              const count = counts.get(tag) ?? 0
              return (
                <button
                  key={tag}
                  className={[
                    'places-chip',
                    active ? 'places-chip-active' : '',
                    TAG_MEANING.has(tag) ? 'places-chip-app' : '',
                    count === 0 ? 'places-chip-empty' : '',
                  ].join(' ')}
                  aria-pressed={active}
                  title={TAG_MEANING.get(tag)}
                  onClick={() => selectTag(tag)}
                >
                  {tag}
                  <span className="places-chip-count">{count}</span>
                </button>
              )
            })}
            <span className="places-chip-divider" aria-hidden="true" />
            <button
              className={`places-chip ${filter.kind === 'ios-unset' ? 'places-chip-active' : ''}`}
              aria-pressed={filter.kind === 'ios-unset'}
              title={`Neither ${IOS_ALLOWED_TAG} nor ${IOS_BANNED_TAG}: nobody has decided yet`}
              onClick={toggleIosUnset}
            >
              No iOS status
            </button>
            {hasFilters && (
              <button className="places-link-button places-clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        <ListSummary
          source={source}
          query={debouncedQuery}
          inventoryLoading={inventoryLoading}
          inventoryFailed={inventory.error !== null}
          inventoryTotal={places?.length ?? 0}
          searchLoading={searchLoading}
          search={currentSearch}
          visibleCount={visibleRows.length}
          tagFilter={filter.kind === 'tag' ? filter.tag : null}
          detailsFailed={details === 'failed'}
        />

        {visibleRows.length > 0 && (
          <div className="places-list-header">
            <label className="places-select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                disabled={!canWrite}
              />
              Select all shown
            </label>
            <button
              className="places-button-secondary"
              onClick={handleExport}
              // Titles and descriptions are still arriving for the curated list
              disabled={source === 'inventory' && details === 'loading'}
            >
              Export CSV ({visibleRows.length})
            </button>
          </div>
        )}

        <datalist id={TAG_OPTIONS_ID}>
          {allTags.map(tag => (
            <option key={tag} value={tag} />
          ))}
        </datalist>

        <ul className="places-list">
          {visibleRows.map(row => (
            <SceneRowItem
              key={row.key}
              row={row}
              selected={selected.has(row.key)}
              pending={pendingKeys.has(row.key)}
              error={rowErrors.get(row.key) ?? null}
              canWrite={canWrite}
              missingDetails={!row.info && details === 'ready'}
              onToggleSelected={() => toggleSelected(row)}
              onSetTags={tags => handleSetTags(row, tags)}
            />
          ))}
        </ul>

        {source === 'search' && currentSearch && currentSearch.nextOffset < currentSearch.total && (
          <div className="places-load-more">
            <button className="places-button-secondary" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          state={bulk}
          removableTags={removableTags}
          onRequest={action => setBulk({ status: 'confirming', action })}
          onConfirm={action => void runBulk(action)}
          onCancel={() => setBulk({ status: 'idle' })}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className="places-segmented" role="group" aria-label={label}>
      <span className="places-filter-label">{label}</span>
      {options.map(option => (
        <button
          key={option.value}
          className={`places-segment ${value === option.value ? 'places-segment-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="places-chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

const ListSummary: FC<{
  source: 'search' | 'inventory'
  query: string
  inventoryLoading: boolean
  inventoryFailed: boolean
  inventoryTotal: number
  searchLoading: boolean
  search: SearchState | null
  visibleCount: number
  tagFilter: string | null
  detailsFailed: boolean
}> = ({ source, query, inventoryLoading, inventoryFailed, inventoryTotal, searchLoading, search, visibleCount, tagFilter, detailsFailed }) => {
  const trimmed = query.trim()
  let text: string
  let hint: string | null = null

  if (source === 'search') {
    if (searchLoading) text = 'Searching…'
    else if (search?.error) text = search.error
    else {
      const total = search?.total ?? 0
      const loaded = search?.scenes.length ?? 0
      text = `${plural(total, 'result')} for “${trimmed}” across Genesis City and Worlds`
      if (visibleCount !== loaded) text += ` · ${visibleCount} shown`
    }
  } else {
    if (inventoryLoading) text = 'Loading scenes…'
    else if (inventoryFailed) text = 'Tagged places could not be loaded.'
    else if (tagFilter) text = `${plural(visibleCount, 'place')} tagged ${tagFilter}`
    else text = `${visibleCount} of ${plural(inventoryTotal, 'tagged place')}`
    if (tagFilter) {
      hint = `${trimmed ? 'Searching' : 'Search'} within ${tagFilter} only. Clear the tag filter to search every place.`
    } else if (trimmed && !isSearchable(trimmed)) {
      hint = `Type at least ${MIN_SEARCH_LENGTH} characters to search every place.`
    } else if (!trimmed) {
      hint = 'Search to find any place in Genesis City or Worlds, including ones without tags yet.'
    }
  }

  return (
    <div className="places-summary" aria-live="polite">
      <span className={source === 'search' && search?.error ? 'places-summary-error' : undefined}>{text}</span>
      {hint && <span className="places-summary-hint">{hint}</span>}
      {detailsFailed && (
        <span className="places-summary-hint">Some titles and thumbnails could not be loaded from the Places API.</span>
      )}
    </div>
  )
}

const SceneRowItem: FC<{
  row: SceneRow
  selected: boolean
  pending: boolean
  error: string | null
  canWrite: boolean
  missingDetails: boolean
  onToggleSelected: () => void
  onSetTags: (tags: string[]) => void
}> = ({ row, selected, pending, error, canWrite, missingDetails, onToggleSelected, onSetTags }) => {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const tags = rowTags(row)
  const status = iosStatus(tags)
  const ruleBlock = iosRuleBlock(row.info)
  const featured = tags.includes(FEATURED_TAG)
  const otherTags = tags.filter(t => !hasOwnControl(t))
  const title = rowTitle(row)
  const link = placesSiteUrl(row, SITE_ORIGIN)
  const parcels = rowParcelCount(row)
  const userCount = row.info?.userCount ?? 0
  const disabled = !canWrite || pending

  const submitTag = (e: FormEvent) => {
    e.preventDefault()
    const tag = normalizeTag(draft)
    if (tag) onSetTags(withTag(tags, tag))
    setDraft('')
    setAdding(false)
  }

  const toggleIos = (target: 'allowed' | 'banned') => {
    onSetTags(withIosStatus(tags, status === target ? 'unset' : target))
  }

  return (
    <li className={`place-row ${selected ? 'place-row-selected' : ''} ${pending ? 'place-row-pending' : ''}`}>
      <input
        type="checkbox"
        className="place-row-check"
        aria-label={`Select ${title}`}
        checked={selected}
        onChange={onToggleSelected}
        disabled={!canWrite}
      />

      <div className="place-row-thumb">
        {row.info?.thumbnail ? <img src={row.info.thumbnail} alt="" loading="lazy" /> : <span>{row.kind === 'world' ? '🌍' : '🏙'}</span>}
      </div>

      <div className="place-row-body">
        <div className="place-row-title">
          <span>{title}</span>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="place-row-link" aria-label={`Open ${title} on the Places site`}>
              ↗
            </a>
          )}
        </div>

        <div className="place-row-meta">
          <span className={`place-kind place-kind-${row.kind}`}>{row.kind === 'world' ? 'World' : 'Genesis City'}</span>
          <span>{row.kind === 'world' ? rowWorldName(row) : rowBasePosition(row)}</span>
          {row.kind === 'genesis' && parcels > 1 && <span>{plural(parcels, 'parcel')}</span>}
          {userCount > 0 && <span className="place-row-online">● {userCount} online</span>}
          {row.info?.owner && <span>by {row.info.owner}</span>}
          {missingDetails && <span className="place-row-missing">Not listed on Places</span>}
          {ruleBlock && status === 'unset' && (
            <span className="place-row-blocked" title="Hidden from iOS automatically. Mark it Allowed to list it anyway.">
              Blocked on iOS: {ruleBlock}
            </span>
          )}
          {ruleBlock && status === 'allowed' && (
            <span className="place-row-missing" title={`${IOS_ALLOWED_TAG} keeps it listed on iOS`}>
              {ruleBlock}, listed on iOS because it is Allowed
            </span>
          )}
          {featuredOutsideIos(tags) && (
            <span
              className="place-row-missing"
              title={`The featured carousel asks for ${FEATURED_TAG} and ${IOS_ALLOWED_TAG}, but the BFF applies only the first tag, so iOS shows this place anyway`}
            >
              Featured but not allowed on iOS
            </span>
          )}
        </div>

        <div className="place-row-tags">
          {otherTags.map(tag => (
            <span key={tag} className="place-tag">
              {tag}
              {canWrite && (
                <button
                  className="place-tag-remove"
                  aria-label={`Remove ${tag} from ${title}`}
                  disabled={pending}
                  onClick={() => onSetTags(withoutTag(tags, tag))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canWrite &&
            (adding ? (
              <form className="place-tag-form" onSubmit={submitTag}>
                <input
                  aria-label={`New tag for ${title}`}
                  list={TAG_OPTIONS_ID}
                  value={draft}
                  placeholder="tag name"
                  autoFocus
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setDraft('')
                      setAdding(false)
                    }
                  }}
                />
                <button type="submit" className="places-button-small" disabled={!normalizeTag(draft) || pending}>
                  Add
                </button>
              </form>
            ) : (
              <button
                className="place-tag-add"
                aria-label={`Add tag to ${title}`}
                disabled={pending}
                onClick={() => setAdding(true)}
              >
                + Tag
              </button>
            ))}
          {!canWrite && otherTags.length === 0 && <span className="place-row-muted">No other tags</span>}
        </div>

        {error && <div className="place-row-error">{error}</div>}
      </div>

      <div className="place-controls">
      <button
        className={`place-feature ${featured ? 'place-feature-on' : ''}`}
        aria-pressed={featured}
        aria-label={`Featured: ${title}`}
        title={TAG_MEANING.get(FEATURED_TAG)}
        disabled={disabled}
        onClick={() => onSetTags(withFlag(tags, FEATURED_TAG, !featured))}
      >
        ★ Featured
      </button>
      <div
        className={`place-ios ${status === 'conflict' ? 'place-ios-conflict' : ''}`}
        role="group"
        aria-label={`iOS status for ${title}`}
        title={status === 'conflict' ? `Has both ${IOS_ALLOWED_TAG} and ${IOS_BANNED_TAG}: pick one` : undefined}
      >
        <span className="place-ios-label">iOS</span>
        <button
          className={`place-ios-button place-ios-allowed ${status === 'allowed' || status === 'conflict' ? 'place-ios-on' : ''}`}
          aria-pressed={status === 'allowed' || status === 'conflict'}
          disabled={disabled}
          onClick={() => toggleIos('allowed')}
        >
          Allowed
        </button>
        <button
          className={`place-ios-button place-ios-banned ${status === 'banned' || status === 'conflict' ? 'place-ios-on' : ''}`}
          aria-pressed={status === 'banned' || status === 'conflict'}
          disabled={disabled}
          onClick={() => toggleIos('banned')}
        >
          Banned
        </button>
      </div>
      </div>
    </li>
  )
}

const BulkBar: FC<{
  count: number
  state: BulkState
  removableTags: string[]
  onRequest: (action: BulkAction) => void
  onConfirm: (action: BulkAction) => void
  onCancel: () => void
  onClearSelection: () => void
}> = ({ count, state, removableTags, onRequest, onConfirm, onCancel, onClearSelection }) => {
  const [tagDraft, setTagDraft] = useState('')

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const tag = normalizeTag(tagDraft)
    if (!tag) return
    setTagDraft('')
    onRequest({ kind: 'add', tag })
  }

  return (
    <div className="places-bulk" role="region" aria-label="Bulk actions">
      <span className="places-bulk-count">{plural(count, 'place')} selected</span>

      {state.status === 'confirming' ? (
        <>
          <span className="places-bulk-question">{describeBulkAction(state.action, count)}</span>
          <button className="places-button-primary" onClick={() => onConfirm(state.action)}>
            Confirm
          </button>
          <button className="places-button-secondary" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : state.status === 'running' ? (
        <span className="places-bulk-progress">
          Saving {state.done}/{state.total}…
        </span>
      ) : (
        <>
          <div className="places-bulk-group" role="group" aria-label="Set iOS status of selected">
            <button className="places-button-allow" onClick={() => onRequest({ kind: 'ios', status: 'allowed' })}>
              Allow on iOS
            </button>
            <button className="places-button-ban" onClick={() => onRequest({ kind: 'ios', status: 'banned' })}>
              Ban on iOS
            </button>
            <button className="places-button-secondary" onClick={() => onRequest({ kind: 'ios', status: 'unset' })}>
              Clear iOS
            </button>
          </div>
          <div className="places-bulk-group" role="group" aria-label="Feature selected">
            <button className="places-button-feature" onClick={() => onRequest({ kind: 'add', tag: FEATURED_TAG })}>
              ★ Feature
            </button>
            <button className="places-button-secondary" onClick={() => onRequest({ kind: 'remove', tag: FEATURED_TAG })}>
              Unfeature
            </button>
          </div>
          <form className="places-bulk-group" onSubmit={submitAdd}>
            <input
              aria-label="Tag to add to selected"
              list={TAG_OPTIONS_ID}
              placeholder="tag name"
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
            />
            <button type="submit" className="places-button-secondary" disabled={!normalizeTag(tagDraft)}>
              Add tag
            </button>
          </form>
          {removableTags.length > 0 && (
            <select
              aria-label="Tag to remove from selected"
              value=""
              onChange={e => e.target.value && onRequest({ kind: 'remove', tag: e.target.value })}
            >
              <option value="">Remove tag…</option>
              {removableTags.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}
          {state.status === 'finished' && (
            <span className={state.failed > 0 ? 'places-bulk-failed' : 'places-bulk-done'}>
              {state.saved === 0 && state.failed === 0
                ? 'Already up to date'
                : `${plural(state.saved, 'place')} saved${state.failed > 0 ? `, ${state.failed} failed` : ''}`}
            </span>
          )}
          <button className="places-link-button places-bulk-clear" onClick={onClearSelection}>
            Clear selection
          </button>
        </>
      )}
    </div>
  )
}
