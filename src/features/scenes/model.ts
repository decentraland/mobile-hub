import type { Place } from '../places/types'
import type { CreatePlaceInput } from '../places/placesApi'

export type SceneKind = 'genesis' | 'world'
export type SceneScope = 'all' | SceneKind

/** A scene as the Places API lists it (read through the BFF's /destinations proxy). */
export interface SceneInfo {
  key: string
  kind: SceneKind
  title: string
  description: string | null
  thumbnail: string | null
  basePosition: string | null  // Genesis City only
  positions: string[]          // Genesis City only
  worldName: string | null     // Worlds only, lowercased
  owner: string | null
  userCount: number
  contentRating: string | null // Places API rating: A (adult), R (restricted), T, E; RP/PR unrated
  categories: string[]
}

/**
 * One line of the Scenes list. `info` is what the Places API knows about the scene, `place` is
 * the BFF record holding its tags. A search result has no `place` until it gets its first tag;
 * a BFF record has no `info` when the Places API stopped listing the scene (undeployed, deleted).
 */
export interface SceneRow {
  key: string
  kind: SceneKind
  info: SceneInfo | null
  place: Place | null
}

// With the BFF's `ios-blocklist` flag off, iOS lists only `allowed_ios` scenes. With it on, iOS
// lists everything except `banned_ios` scenes and the ones `iosRuleBlock` names, unless those
// are `allowed_ios`. Either way `banned_ios` records that someone reviewed the scene and said no.
export const IOS_ALLOWED_TAG = 'allowed_ios'
export const IOS_BANNED_TAG = 'banned_ios'

// Hidden from Discover on Android and iOS; the BFF applies it over `allowed_ios` and the flag
export const BANNED_TAG = 'banned'

// The Discover featured carousel lists the places with this tag; `ftue` fills the first-time one
export const FEATURED_TAG = 'featured'
export const FTUE_TAG = 'ftue'

// Tags the apps read, in the order the filter lists them, with what each one does there
export const APP_TAGS: ReadonlyArray<{ tag: string; meaning: string }> = [
  { tag: BANNED_TAG, meaning: 'Hidden from Discover on Android and iOS' },
  { tag: IOS_ALLOWED_TAG, meaning: 'Listed in the iOS app, whatever its rating' },
  { tag: IOS_BANNED_TAG, meaning: 'Reviewed and kept out of the iOS app' },
  { tag: FEATURED_TAG, meaning: 'Shown in the Discover featured carousel' },
  { tag: FTUE_TAG, meaning: 'Shown in the first-time user carousel' },
]

export type IosStatus = 'allowed' | 'banned' | 'unset' | 'conflict'

/** One tag at a time, or the places nobody has decided on for iOS yet. */
export type TagFilter = { kind: 'all' } | { kind: 'tag'; tag: string } | { kind: 'ios-unset' }

// Tags that cannot sit on the same scene: adding one removes the other.
const EXCLUSIVE_TAGS: Record<string, string> = {
  [IOS_ALLOWED_TAG]: IOS_BANNED_TAG,
  [IOS_BANNED_TAG]: IOS_ALLOWED_TAG,
}

// The Places API only searches with three characters or more
export const MIN_SEARCH_LENGTH = 3

export function sceneKey(kind: SceneKind, id: string): string {
  return `${kind}:${id}`
}

export function isIosTag(tag: string): boolean {
  return tag === IOS_ALLOWED_TAG || tag === IOS_BANNED_TAG
}

/** Tags with their own control on each row; the rest show as removable chips. */
export function hasOwnControl(tag: string): boolean {
  return isIosTag(tag) || tag === FEATURED_TAG || tag === FTUE_TAG || tag === BANNED_TAG
}

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

export function rowTags(row: SceneRow): string[] {
  return row.place?.tags ?? []
}

export function iosStatus(tags: string[]): IosStatus {
  const allowed = tags.includes(IOS_ALLOWED_TAG)
  const banned = tags.includes(IOS_BANNED_TAG)
  if (allowed && banned) return 'conflict'
  if (allowed) return 'allowed'
  if (banned) return 'banned'
  return 'unset'
}

// The same rules as the BFF's iOS block list (mobile-bff src/logic/content-policy.ts)
const IOS_BLOCKED_RATINGS: Record<string, string> = { A: 'Rated A (adult)', R: 'Rated R (restricted)' }
const IOS_BLOCKED_CATEGORIES = ['casino']

/** Why iOS hides the scene without anyone tagging it, or null. `allowed_ios` overrides it. */
export function iosRuleBlock(info: SceneInfo | null): string | null {
  if (!info) return null
  const rating = IOS_BLOCKED_RATINGS[info.contentRating?.toUpperCase() ?? '']
  if (rating) return rating
  return info.categories.some(c => IOS_BLOCKED_CATEGORIES.includes(c.toLowerCase())) ? 'Casino' : null
}

export function withTag(tags: string[], rawTag: string): string[] {
  const tag = normalizeTag(rawTag)
  if (!tag) return tags
  const exclusive = EXCLUSIVE_TAGS[tag]
  const kept = tags.filter(t => t !== tag && t !== exclusive)
  return [...kept, tag]
}

export function withoutTag(tags: string[], tag: string): string[] {
  return tags.filter(t => t !== tag)
}

export function withIosStatus(tags: string[], status: 'allowed' | 'banned' | 'unset'): string[] {
  const rest = tags.filter(t => !isIosTag(t))
  if (status === 'allowed') return [...rest, IOS_ALLOWED_TAG]
  if (status === 'banned') return [...rest, IOS_BANNED_TAG]
  return rest
}

export function withFlag(tags: string[], tag: string, on: boolean): string[] {
  return on ? withTag(tags, tag) : withoutTag(tags, tag)
}

/**
 * The featured carousel asks the BFF for `featured` and `allowed_ios` as two `tag` params, and
 * the BFF reads only the first. So on iOS it shows every featured place, allowed or not.
 */
export function featuredOutsideIos(tags: string[]): boolean {
  return tags.includes(FEATURED_TAG) && !tags.includes(IOS_ALLOWED_TAG)
}

export function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(t => set.has(t))
}

// The Places API refuses a pointer outside this shape, and with it the whole request
const PARCEL_PATTERN = /^-?\d{1,3},-?\d{1,3}$/

export function isParcel(position: string): boolean {
  return PARCEL_PATTERN.test(position)
}

/** "x,y" (spaces tolerated) as the Places API spells a parcel, or null for any other query. */
export function parseCoordinates(query: string): string | null {
  const match = query.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/)
  if (!match) return null
  const position = `${Number(match[1])},${Number(match[2])}`
  return isParcel(position) ? position : null
}

export function isSearchable(query: string): boolean {
  return parseCoordinates(query) !== null || query.trim().length >= MIN_SEARCH_LENGTH
}

/**
 * Where the list comes from. Filtering on a tag reads the BFF's own records, which are complete,
 * instead of filtering one page of global search results. Otherwise a searchable query goes to
 * the Places API, and anything shorter filters the BFF's records locally.
 */
export function listSource(query: string, filter: TagFilter): 'search' | 'inventory' {
  if (filter.kind === 'tag') return 'inventory'
  return isSearchable(query) ? 'search' : 'inventory'
}

// ---------- Matching Places API results to BFF records ----------

export interface PlaceIndex {
  byWorld: Map<string, Place>
  byPosition: Map<string, Place>
}

export function indexPlaces(places: Place[]): PlaceIndex {
  const byWorld = new Map<string, Place>()
  const byPosition = new Map<string, Place>()
  for (const place of places) {
    if (place.type === 'world') {
      const name = place.worldName?.toLowerCase()
      if (name && !byWorld.has(name)) byWorld.set(name, place)
      continue
    }
    for (const position of [place.basePosition, ...place.positions]) {
      if (position && !byPosition.has(position)) byPosition.set(position, place)
    }
  }
  return { byWorld, byPosition }
}

/**
 * A scene's tags live on whichever BFF record covers it. Genesis City records are matched on any
 * shared parcel, not just the base, so a redeploy that moved the base still finds its tags (and
 * tagging it does not try to create a second record over the same parcels, which the BFF refuses).
 */
export function findPlace(index: PlaceIndex, info: SceneInfo): Place | null {
  if (info.kind === 'world') {
    return info.worldName ? index.byWorld.get(info.worldName) ?? null : null
  }
  for (const position of [info.basePosition, ...info.positions]) {
    const place = position ? index.byPosition.get(position) : undefined
    if (place) return place
  }
  return null
}

export function toRow(info: SceneInfo, index: PlaceIndex): SceneRow {
  return { key: info.key, kind: info.kind, info, place: findPlace(index, info) }
}

/**
 * A row selected earlier, with the BFF record as it is now. A bulk action works from the selection,
 * and a scene that got its first tag since it was selected must update that record, not create
 * a second one.
 */
export function refreshRow(row: SceneRow, places: Place[], index: PlaceIndex): SceneRow {
  if (row.place) {
    const id = row.place.id
    return { ...row, place: places.find(p => p.id === id) ?? row.place }
  }
  return row.info ? { ...row, place: findPlace(index, row.info) } : row
}

function placeKind(place: Place): SceneKind {
  return place.type === 'world' ? 'world' : 'genesis'
}

function fallbackKey(place: Place): string {
  if (place.type === 'world' && place.worldName) return sceneKey('world', place.worldName.toLowerCase())
  if (place.basePosition) return sceneKey('genesis', place.basePosition)
  return `place:${place.id}`
}

/** Every BFF record as a row, with whatever the Places API told us about it. */
export function inventoryRows(places: Place[], knownScenes: Iterable<SceneInfo>): SceneRow[] {
  const index = indexPlaces(places)
  const infoByPlaceId = new Map<string, SceneInfo>()
  for (const info of knownScenes) {
    const place = findPlace(index, info)
    if (place && !infoByPlaceId.has(place.id)) infoByPlaceId.set(place.id, info)
  }

  const usedKeys = new Set<string>()
  const rows = places.map(place => {
    const info = infoByPlaceId.get(place.id) ?? null
    let key = info?.key ?? fallbackKey(place)
    // Two records can resolve to the same scene; the list still needs one key per row
    if (usedKeys.has(key)) key = `place:${place.id}`
    usedKeys.add(key)
    return { key, kind: placeKind(place), info, place }
  })

  return rows.sort((a, b) => rowTitle(a).localeCompare(rowTitle(b), undefined, { sensitivity: 'base' }))
}

// ---------- Filters ----------

export function matchesScope(row: SceneRow, scope: SceneScope): boolean {
  return scope === 'all' || row.kind === scope
}

export function matchesFilter(row: SceneRow, filter: TagFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'ios-unset') return iosStatus(rowTags(row)) === 'unset'
  return rowTags(row).includes(filter.tag)
}

/** The tags the apps read first, in their fixed order, then the most used. */
export function sortTagsForFilter(tags: Iterable<string>, counts: Map<string, number>): string[] {
  const appOrder = new Map(APP_TAGS.map(({ tag }, i) => [tag, i]))
  return [...new Set(tags)].sort((a, b) => {
    const appA = appOrder.get(a) ?? Infinity
    const appB = appOrder.get(b) ?? Infinity
    if (appA !== appB) return appA - appB
    const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    return byCount !== 0 ? byCount : a.localeCompare(b)
  })
}

/** Local text match over BFF records: title, world name, or a parcel the scene covers. */
export function matchesText(row: SceneRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const coords = parseCoordinates(q)
  const positions = row.info?.positions.length ? row.info.positions : row.place?.positions ?? []
  if (coords) {
    return positions.includes(coords) || row.info?.basePosition === coords || row.place?.basePosition === coords
  }
  const haystack = [
    row.info?.title,
    row.info?.worldName,
    row.place?.name,
    row.place?.worldName,
    row.info?.basePosition ?? row.place?.basePosition,
  ]
  return haystack.some(value => value?.toLowerCase().includes(q))
}

/** How many BFF records in scope carry each tag. */
export function tagCounts(places: Place[], scope: SceneScope): Map<string, number> {
  const counts = new Map<string, number>()
  for (const place of places) {
    if (scope !== 'all' && placeKind(place) !== scope) continue
    for (const tag of place.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

// ---------- Display ----------

export function rowTitle(row: SceneRow): string {
  return (
    row.info?.title ||
    row.place?.name ||
    row.place?.worldName ||
    (row.place?.basePosition ? `Scene at ${row.place.basePosition}` : 'Unknown scene')
  )
}

export function rowWorldName(row: SceneRow): string | null {
  return row.info?.worldName ?? row.place?.worldName?.toLowerCase() ?? null
}

export function rowBasePosition(row: SceneRow): string | null {
  return row.info?.basePosition ?? row.place?.basePosition ?? null
}

export function rowParcelCount(row: SceneRow): number {
  return row.info?.positions.length || row.place?.positions.length || 0
}

/** The link that opens the place in the mobile app. */
export function deepLink(row: SceneRow): string {
  if (row.kind === 'world') {
    const name = rowWorldName(row)
    return name ? `decentraland://open?realm=${name}` : ''
  }
  const base = rowBasePosition(row)
  return base ? `decentraland://open?position=${base}` : ''
}

/** The public Places page for the scene, so a reviewer can look before deciding. */
export function placesSiteUrl(row: SceneRow, siteOrigin: string): string | null {
  if (row.kind === 'world') {
    const name = rowWorldName(row)
    return name ? `${siteOrigin}/places/world/?name=${encodeURIComponent(name)}` : null
  }
  const base = rowBasePosition(row)
  return base ? `${siteOrigin}/places/place/?position=${encodeURIComponent(base)}` : null
}

/** The BFF record to create the first time a scene gets a tag. */
export function placeInputFor(row: SceneRow, tags: string[]): CreatePlaceInput {
  const info = row.info
  if (!info) throw new Error('Cannot tag a scene the Places API does not list')
  if (info.kind === 'world') {
    return { type: 'world', worldName: info.worldName ?? undefined, name: info.title, tags }
  }
  return {
    type: 'scene',
    basePosition: info.basePosition ?? undefined,
    positions: info.positions,
    name: info.title,
    tags,
  }
}
