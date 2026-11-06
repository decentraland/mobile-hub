import { useEffect, useState, type FC, type ReactNode } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import {
  deleteNews,
  excludeCreator,
  excludePlace,
  getCreators,
  getCycles,
  getCyclePlaces,
  getExclusions,
  getNews,
  getTerms,
  includeCreator,
  includePlace,
  publishTerms,
  putCycle,
  putNews,
  runSweep,
  setCreatorStatus,
  type AdminCreator,
  type AdminCyclePlace,
  type AuthenticatedFetch,
  type Cycle,
  type Exclusions,
  type NewsItem,
  type SweepResult,
  type Terms,
} from '../features/creator-fund/api'
import './CreatorFundPage.css'

/** One write, shown in the confirm dialog before it runs. The page reloads after it succeeds. */
interface Action {
  title: string
  detail: string
  warning?: string
  danger?: boolean
  run: () => Promise<void>
}

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; action: Action }
  | { status: 'saving'; action: Action }
  | { status: 'error'; action: Action; message: string }

interface PageData {
  cycles: Cycle[]
  terms: Terms | null
  news: NewsItem[]
  creators: AdminCreator[]
  exclusions: Exclusions
}

const PLACE_REASONS = [
  { value: 'content_policy', label: 'Content policy' },
  { value: 'excluded', label: 'Excluded' },
] as const
const CREATOR_REASONS = [
  { value: 'internal', label: 'Internal account' },
  { value: 'excluded', label: 'Excluded' },
] as const

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/** An ISO instant as a `datetime-local` input wants it, in the browser's zone. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function nextId(items: Array<{ id: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function creatorsToCsv(creators: AdminCreator[]): string {
  const columns: Array<keyof AdminCreator> = [
    'address',
    'first_name',
    'last_name',
    'email',
    'email_verified_at',
    'status',
    'enrolled_at',
    'terms_version',
  ]
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [columns.join(','), ...creators.map(creator => columns.map(column => cell(creator[column])).join(','))].join(
    '\n'
  )
}

async function loadPage(authenticatedFetch: AuthenticatedFetch): Promise<{ data: PageData } | { error: string }> {
  try {
    const [cycles, terms, news, creators, exclusions] = await Promise.all([
      getCycles(),
      getTerms(),
      getNews(),
      getCreators(authenticatedFetch),
      getExclusions(authenticatedFetch),
    ])
    return { data: { cycles, terms, news, creators, exclusions } }
  } catch (err) {
    return { error: errorMessage(err, 'Failed to load the Creator Fund') }
  }
}

export const CreatorFundPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const [data, setData] = useState<PageData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  // Bumped after every confirmed write and by Retry, so the whole page re-reads what the service holds.
  const [generation, setGeneration] = useState(0)
  const reload = () => setGeneration(current => current + 1)

  useEffect(() => {
    let cancelled = false
    loadPage(authenticatedFetch).then(result => {
      if (cancelled) return
      if ('error' in result) {
        setLoadError(result.error)
      } else {
        setData(result.data)
        setLoadError(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, generation])

  const ask = (action: Action) => setConfirm({ status: 'confirming', action })

  const handleConfirm = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { action } = confirm
    setConfirm({ status: 'saving', action })
    try {
      await action.run()
      setConfirm({ status: 'idle' })
      reload()
    } catch (err) {
      setConfirm({ status: 'error', action, message: errorMessage(err, 'The change was not saved') })
    }
  }

  return (
    <div className="cf-page">
      <div className="cf-container">
        <header className="cf-header">
          <h1>Creator Fund</h1>
          <p>
            Cycles, terms, news, enrolled creators and exclusions, as creators-data serves them to Creator
            Hub. Every change asks before it runs and is recorded with your wallet.
          </p>
        </header>

        {loadError && (
          <div className="cf-error">
            {loadError}{' '}
            <button className="cf-link-button" onClick={reload}>
              Retry
            </button>
          </div>
        )}
        {!data && !loadError && <div className="cf-loading">Loading…</div>}

        {data && (
          <>
            <CyclesSection cycles={data.cycles} authenticatedFetch={authenticatedFetch} ask={ask} />
            <TermsSection terms={data.terms} authenticatedFetch={authenticatedFetch} ask={ask} />
            <NewsSection news={data.news} authenticatedFetch={authenticatedFetch} ask={ask} />
            <CreatorsSection
              creators={data.creators}
              excluded={new Set(data.exclusions.creators.map(exclusion => exclusion.address))}
              authenticatedFetch={authenticatedFetch}
              ask={ask}
            />
            <ExclusionsSection exclusions={data.exclusions} authenticatedFetch={authenticatedFetch} ask={ask} />
            <CyclePlacesSection
              cycles={data.cycles}
              excluded={new Set(data.exclusions.places.map(exclusion => exclusion.place_id))}
              authenticatedFetch={authenticatedFetch}
              ask={ask}
            />
            <SweepSection authenticatedFetch={authenticatedFetch} ask={ask} />
          </>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog state={confirm} onConfirm={handleConfirm} onCancel={() => setConfirm({ status: 'idle' })} />
      )}
    </div>
  )
}

interface SectionProps {
  authenticatedFetch: AuthenticatedFetch
  ask: (action: Action) => void
}

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <section className="cf-section">
    <h2>{title}</h2>
    {children}
  </section>
)

const CyclesSection: FC<SectionProps & { cycles: Cycle[] }> = ({ cycles, authenticatedFetch, ask }) => {
  const [id, setId] = useState(String(nextId(cycles)))
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [pool, setPool] = useState('')
  const [error, setError] = useState<string | null>(null)

  const edit = (cycle: Cycle) => {
    setId(String(cycle.id))
    setStartAt(toLocalInput(cycle.start_at))
    setEndAt(toLocalInput(cycle.end_at))
    setPool(cycle.pool_usdc === null ? '' : String(cycle.pool_usdc))
    setError(null)
  }

  const submit = () => {
    const cycleId = Number(id)
    if (!Number.isInteger(cycleId) || cycleId < 1 || !startAt || !endAt) {
      setError('A positive id and both dates are needed')
      return
    }
    const poolUsdc = pool.trim() === '' ? null : Number(pool)
    if (poolUsdc !== null && (!Number.isFinite(poolUsdc) || poolUsdc < 0)) {
      setError('The pool must be a non-negative amount, or empty')
      return
    }
    setError(null)
    const input = { start_at: new Date(startAt).toISOString(), end_at: new Date(endAt).toISOString(), pool_usdc: poolUsdc }
    const exists = cycles.some(cycle => cycle.id === cycleId)
    ask({
      title: exists ? `Update cycle ${cycleId}` : `Create cycle ${cycleId}`,
      detail: `${formatDate(input.start_at)} → ${formatDate(input.end_at)}, pool ${poolUsdc === null ? 'unset' : `${poolUsdc} USDC`}`,
      run: () => putCycle(authenticatedFetch, cycleId, input).then(() => undefined),
    })
  }

  return (
    <Section title="Cycles">
      <table className="cf-table">
        <thead>
          <tr>
            <th>Id</th>
            <th>Start</th>
            <th>End</th>
            <th>Pool</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cycles.map(cycle => (
            <tr key={cycle.id}>
              <td>{cycle.id}</td>
              <td>{formatDate(cycle.start_at)}</td>
              <td>{formatDate(cycle.end_at)}</td>
              <td>{cycle.pool_usdc === null ? '—' : `${cycle.pool_usdc} USDC`}</td>
              <td>
                <span className={`cf-badge cf-badge-${cycle.status}`}>{cycle.status}</span>
              </td>
              <td className="cf-row-actions">
                <button className="cf-button-secondary" onClick={() => edit(cycle)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {cycles.length === 0 && (
            <tr>
              <td colSpan={6} className="cf-empty">
                No cycles yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="cf-form">
        <label>
          <span>Id</span>
          <input aria-label="Cycle id" value={id} inputMode="numeric" onChange={e => setId(e.target.value)} />
        </label>
        <label>
          <span>Start</span>
          <input aria-label="Cycle start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
        </label>
        <label>
          <span>End</span>
          <input aria-label="Cycle end" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
        </label>
        <label>
          <span>Pool (USDC)</span>
          <input aria-label="Cycle pool" value={pool} inputMode="decimal" placeholder="unset" onChange={e => setPool(e.target.value)} />
        </label>
        <button className="cf-button-primary" onClick={submit}>
          Save cycle
        </button>
      </div>
      {error && <div className="cf-error">{error}</div>}
      <p className="cf-hint">A closed cycle keeps its dates; only its pool can change. Dates may not overlap another cycle.</p>
    </Section>
  )
}

const TermsSection: FC<SectionProps & { terms: Terms | null }> = ({ terms, authenticatedFetch, ask }) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nextVersion = (terms?.version ?? 0) + 1

  const submit = () => {
    if (title.trim() === '' || content.trim() === '') {
      setError('A title and the Markdown content are needed')
      return
    }
    setError(null)
    ask({
      title: `Publish terms version ${nextVersion}`,
      detail: title.trim(),
      warning: terms
        ? 'Every enrolled creator drops to "terms outdated" until they accept the new version in Creator Hub.'
        : undefined,
      run: () => publishTerms(authenticatedFetch, nextVersion, { title: title.trim(), content }).then(() => undefined),
    })
  }

  return (
    <Section title="Terms">
      {terms ? (
        <details className="cf-details">
          <summary>
            Version {terms.version}: {terms.title} <span className="cf-muted">({formatDate(terms.published_at)})</span>
          </summary>
          <pre className="cf-pre">{terms.content}</pre>
        </details>
      ) : (
        <p className="cf-hint">No terms are published yet, so nobody can join.</p>
      )}
      <div className="cf-form cf-form-column">
        <label>
          <span>Title for version {nextVersion}</span>
          <input aria-label="Terms title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
        </label>
        <label>
          <span>Content (Markdown)</span>
          <textarea aria-label="Terms content" value={content} rows={8} onChange={e => setContent(e.target.value)} />
        </label>
        <button className="cf-button-primary" onClick={submit}>
          Publish version {nextVersion}
        </button>
      </div>
      {error && <div className="cf-error">{error}</div>}
    </Section>
  )
}

const NewsSection: FC<SectionProps & { news: NewsItem[] }> = ({ news, authenticatedFetch, ask }) => {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (title.trim() === '' || body.trim() === '') {
      setError('A title and a body are needed')
      return
    }
    setError(null)
    const id = nextId(news)
    ask({
      title: 'Publish news',
      detail: title.trim(),
      run: () => putNews(authenticatedFetch, id, { title: title.trim(), body: body.trim() }).then(() => undefined),
    })
  }

  return (
    <Section title="News">
      <ul className="cf-list">
        {news.map(item => (
          <li key={item.id}>
            <div>
              <strong>{item.title}</strong> <span className="cf-muted">{formatDate(item.published_at)}</span>
              <p>{item.body}</p>
            </div>
            <button
              className="cf-button-danger"
              aria-label={`Delete news ${item.title}`}
              onClick={() =>
                ask({
                  title: 'Delete news',
                  detail: item.title,
                  danger: true,
                  run: () => deleteNews(authenticatedFetch, item.id),
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
        {news.length === 0 && <li className="cf-empty">No news published.</li>}
      </ul>
      <div className="cf-form cf-form-column">
        <label>
          <span>Title</span>
          <input aria-label="News title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
        </label>
        <label>
          <span>Body</span>
          <textarea aria-label="News body" value={body} rows={3} onChange={e => setBody(e.target.value)} />
        </label>
        <button className="cf-button-primary" onClick={submit}>
          Publish news
        </button>
      </div>
      {error && <div className="cf-error">{error}</div>}
    </Section>
  )
}

const CreatorsSection: FC<SectionProps & { creators: AdminCreator[]; excluded: Set<string> }> = ({
  creators,
  excluded,
  authenticatedFetch,
  ask,
}) => {
  const [filter, setFilter] = useState('')
  const [excluding, setExcluding] = useState<string | null>(null)
  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? creators.filter(creator =>
        [creator.address, creator.first_name, creator.last_name, creator.email].some(field =>
          field.toLowerCase().includes(needle)
        )
      )
    : creators

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([creatorsToCsv(shown)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `creator-fund-creators-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const toggleStatus = (creator: AdminCreator) => {
    const next = creator.status === 'active' ? 'suspended' : 'active'
    ask({
      title: next === 'suspended' ? 'Suspend creator' : 'Reinstate creator',
      detail: `${creator.first_name} ${creator.last_name} (${shortAddress(creator.address)})`,
      warning: next === 'suspended' ? 'Their places leave the programme until reinstated.' : undefined,
      danger: next === 'suspended',
      run: () => setCreatorStatus(authenticatedFetch, creator.address, next).then(() => undefined),
    })
  }

  return (
    <Section title={`Creators (${creators.length})`}>
      <div className="cf-toolbar">
        <input
          aria-label="Filter creators"
          placeholder="Filter by wallet, name or email"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button className="cf-button-secondary" onClick={exportCsv} disabled={shown.length === 0}>
          Export CSV
        </button>
      </div>
      <table className="cf-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Name</th>
            <th>Email</th>
            <th>Joined</th>
            <th>Terms</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map(creator => (
            <tr key={creator.address}>
              <td>
                <code title={creator.address}>{shortAddress(creator.address)}</code>
              </td>
              <td>
                {creator.first_name} {creator.last_name}
              </td>
              <td>
                {creator.email}
                {creator.email_verified_at && <span className="cf-muted"> ✓</span>}
              </td>
              <td>{formatDate(creator.enrolled_at)}</td>
              <td>{creator.terms_version ?? '—'}</td>
              <td>
                <span className={`cf-badge cf-badge-${creator.status}`}>{creator.status}</span>
                {excluded.has(creator.address) && <span className="cf-badge cf-badge-excluded">excluded</span>}
              </td>
              <td className="cf-row-actions">
                <button
                  className="cf-button-secondary"
                  aria-label={`${creator.status === 'active' ? 'Suspend' : 'Reinstate'} ${creator.address}`}
                  onClick={() => toggleStatus(creator)}
                >
                  {creator.status === 'active' ? 'Suspend' : 'Reinstate'}
                </button>
                {!excluded.has(creator.address) && (
                  <button
                    className="cf-button-secondary"
                    aria-label={`Exclude ${creator.address}`}
                    onClick={() => setExcluding(excluding === creator.address ? null : creator.address)}
                  >
                    Exclude
                  </button>
                )}
              </td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="cf-empty">
                {creators.length === 0 ? 'Nobody has joined yet.' : 'No creator matches the filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {excluding && (
        <ExcludeForm
          subject={shortAddress(excluding)}
          reasons={CREATOR_REASONS}
          onCancel={() => setExcluding(null)}
          onSubmit={(reason, note) => {
            setExcluding(null)
            ask({
              title: 'Exclude creator',
              detail: `${shortAddress(excluding)}: ${reason}`,
              warning: 'They cannot join, and their places leave the programme until the exclusion is lifted.',
              danger: true,
              run: () => excludeCreator(authenticatedFetch, excluding, { reason, note }),
            })
          }}
        />
      )}
    </Section>
  )
}

const ExclusionsSection: FC<SectionProps & { exclusions: Exclusions }> = ({ exclusions, authenticatedFetch, ask }) => (
  <Section title="Exclusions">
    <h3>Places</h3>
    <ul className="cf-list">
      {exclusions.places.map(exclusion => (
        <li key={exclusion.place_id}>
          <div>
            <code>{exclusion.place_id}</code> <span className="cf-badge cf-badge-excluded">{exclusion.reason}</span>
            {exclusion.note && <p>{exclusion.note}</p>}
            <span className="cf-muted">{formatDate(exclusion.added_at)}</span>
          </div>
          <button
            className="cf-button-secondary"
            aria-label={`Lift place exclusion ${exclusion.place_id}`}
            onClick={() =>
              ask({
                title: 'Lift place exclusion',
                detail: exclusion.place_id,
                run: () => includePlace(authenticatedFetch, exclusion.place_id),
              })
            }
          >
            Lift
          </button>
        </li>
      ))}
      {exclusions.places.length === 0 && <li className="cf-empty">No excluded places.</li>}
    </ul>
    <h3>Creators</h3>
    <ul className="cf-list">
      {exclusions.creators.map(exclusion => (
        <li key={exclusion.address}>
          <div>
            <code title={exclusion.address}>{shortAddress(exclusion.address)}</code>{' '}
            <span className="cf-badge cf-badge-excluded">{exclusion.reason}</span>
            {exclusion.note && <p>{exclusion.note}</p>}
            <span className="cf-muted">{formatDate(exclusion.added_at)}</span>
          </div>
          <button
            className="cf-button-secondary"
            aria-label={`Lift creator exclusion ${exclusion.address}`}
            onClick={() =>
              ask({
                title: 'Lift creator exclusion',
                detail: shortAddress(exclusion.address),
                run: () => includeCreator(authenticatedFetch, exclusion.address),
              })
            }
          >
            Lift
          </button>
        </li>
      ))}
      {exclusions.creators.length === 0 && <li className="cf-empty">No excluded creators.</li>}
    </ul>
  </Section>
)

const CyclePlacesSection: FC<SectionProps & { cycles: Cycle[]; excluded: Set<string> }> = ({
  cycles,
  excluded,
  authenticatedFetch,
  ask,
}) => {
  const latest = cycles.find(cycle => cycle.status === 'running') ?? cycles[cycles.length - 1]
  const [cycleId, setCycleId] = useState<number | null>(latest?.id ?? null)
  // Keyed by cycle, so switching cycles shows "Loading…" without a reset inside the effect.
  const [loaded, setLoaded] = useState<{ cycleId: number; places?: AdminCyclePlace[]; error?: string } | null>(null)
  const [excluding, setExcluding] = useState<string | null>(null)
  const places = loaded?.cycleId === cycleId ? loaded.places : undefined
  const error = loaded?.cycleId === cycleId ? loaded.error : undefined

  useEffect(() => {
    if (cycleId === null) return
    let cancelled = false
    getCyclePlaces(authenticatedFetch, cycleId)
      .then(rows => ({ cycleId, places: rows }))
      .catch((err: unknown) => ({ cycleId, error: errorMessage(err, 'Failed to load the snapshot') }))
      .then(result => {
        if (!cancelled) setLoaded(result)
      })
    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, cycleId])

  if (cycles.length === 0) return null

  return (
    <Section title="Cycle snapshot">
      <div className="cf-toolbar">
        <select aria-label="Snapshot cycle" value={cycleId ?? ''} onChange={e => setCycleId(Number(e.target.value))}>
          {cycles.map(cycle => (
            <option key={cycle.id} value={cycle.id}>
              Cycle {cycle.id} ({cycle.status}): {formatDate(cycle.start_at)} → {formatDate(cycle.end_at)}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="cf-error">{error}</div>}
      {!places && !error && <div className="cf-loading">Loading…</div>}
      {places && (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Seen</th>
              <th>Removed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {places.map(place => (
              <tr key={`${place.place_id}:${place.address}`}>
                <td>
                  <strong>{place.title ?? place.place_id}</strong>
                  <br />
                  <span className="cf-muted">{place.world ? place.world_name : place.base_position}</span>
                </td>
                <td>
                  <code title={place.address}>{shortAddress(place.address)}</code>
                </td>
                <td>
                  <span className={`cf-badge cf-badge-${place.status}`}>{place.status}</span>
                  {place.reasons.length > 0 && <span className="cf-muted"> {place.reasons.join(', ')}</span>}
                </td>
                <td>{formatDate(place.first_seen_at)}</td>
                <td>{formatDate(place.removed_at)}</td>
                <td className="cf-row-actions">
                  {!excluded.has(place.place_id) && (
                    <button
                      className="cf-button-secondary"
                      aria-label={`Exclude place ${place.place_id}`}
                      onClick={() => setExcluding(excluding === place.place_id ? null : place.place_id)}
                    >
                      Exclude
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {places.length === 0 && (
              <tr>
                <td colSpan={6} className="cf-empty">
                  No places recorded for this cycle.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {excluding && (
        <ExcludeForm
          subject={excluding}
          reasons={PLACE_REASONS}
          onCancel={() => setExcluding(null)}
          onSubmit={(reason, note) => {
            setExcluding(null)
            ask({
              title: 'Exclude place',
              detail: `${excluding}: ${reason}`,
              warning: 'The place leaves the programme for every owner until the exclusion is lifted.',
              danger: true,
              run: () => excludePlace(authenticatedFetch, excluding, { reason, note }),
            })
          }}
        />
      )}
    </Section>
  )
}

const SweepSection: FC<SectionProps> = ({ authenticatedFetch, ask }) => {
  const [result, setResult] = useState<SweepResult | null>(null)

  return (
    <Section title="Sweep">
      <p className="cf-hint">
        The hourly job that records every enrolled creator's places for the running cycle. Run it now after
        publishing terms or changing exclusions, so the snapshot catches up without waiting.
      </p>
      <button
        className="cf-button-primary"
        onClick={() =>
          ask({
            title: 'Run the sweep now',
            detail: 'Every enrolled creator is re-discovered. This can take a minute.',
            run: () => runSweep(authenticatedFetch).then(setResult),
          })
        }
      >
        Run sweep
      </button>
      {result && (
        <p className="cf-muted">
          {result.status === 'skipped'
            ? `Skipped: ${result.reason === 'locked' ? 'another run holds the lock' : 'no cycle is running'}`
            : `Swept ${result.creators} creators: ${result.inserted} new, ${result.updated} updated, ${result.removed} removed, ${result.failures} failed`}
        </p>
      )}
    </Section>
  )
}

function ExcludeForm<R extends string>({
  subject,
  reasons,
  onSubmit,
  onCancel,
}: {
  subject: string
  reasons: ReadonlyArray<{ value: R; label: string }>
  onSubmit: (reason: R, note: string | null) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState<R>(reasons[0].value)
  const [note, setNote] = useState('')

  return (
    <div className="cf-form cf-exclude-form">
      <span>
        Exclude <code>{subject}</code>
      </span>
      <select aria-label="Exclusion reason" value={reason} onChange={e => setReason(e.target.value as R)}>
        {reasons.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Exclusion note"
        placeholder="Note for other admins (optional)"
        value={note}
        maxLength={500}
        onChange={e => setNote(e.target.value)}
      />
      <button className="cf-button-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button className="cf-button-danger" onClick={() => onSubmit(reason, note.trim() === '' ? null : note.trim())}>
        Exclude
      </button>
    </div>
  )
}

const ConfirmDialog: FC<{
  state: Exclude<ConfirmState, { status: 'idle' }>
  onConfirm: () => void
  onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
  const { action } = state
  const saving = state.status === 'saving'

  return (
    <div className="cf-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div className="cf-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>{action.title}</h3>
        <p>{action.detail}</p>
        {action.warning && <div className="cf-warning">{action.warning}</div>}
        {state.status === 'error' && <div className="cf-error">{state.message}</div>}
        <div className="cf-modal-actions">
          <button className="cf-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className={action.danger ? 'cf-button-danger' : 'cf-button-primary'} onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
