import { config } from '../../config'
import type { Place } from '../places/types'
import { isParcel, parseCoordinates, sceneKey, type SceneInfo, type SceneScope } from './model'

const API_BASE = config.get('MOBILE_BFF_URL')

// The Places API caps a page at 100
export const SEARCH_PAGE_SIZE = 100
// Parcels or world names per lookup request: each matches one scene at most, so a batch always
// fits in one page, and the URL stays short
const LOOKUP_BATCH_SIZE = 50

interface ApiDestination {
  id: string
  title?: string | null
  description?: string | null
  image?: string | null
  base_position?: string | null
  positions?: string[] | null
  world?: boolean
  world_name?: string | null
  contact_name?: string | null
  owner?: string | null
  user_count?: number | null
  content_rating?: string | null
  categories?: string[] | null
}

interface DestinationsResponse {
  ok: boolean
  data?: ApiDestination[]
  total?: number
  error?: string
}

export interface SceneSearchResult {
  scenes: SceneInfo[]
  total: number
}

export function toSceneInfo(destination: ApiDestination): SceneInfo | null {
  const common = {
    description: destination.description || null,
    thumbnail: destination.image || null,
    owner: destination.contact_name || destination.owner || null,
    userCount: Number(destination.user_count ?? 0) || 0,
    contentRating: destination.content_rating || null,
    categories: Array.isArray(destination.categories) ? destination.categories : [],
  }

  // Worlds also carry a base_position ("0,0"), so `world` has to be checked first
  if (destination.world) {
    if (!destination.world_name) return null
    const worldName = destination.world_name.toLowerCase()
    return {
      ...common,
      key: sceneKey('world', worldName),
      kind: 'world',
      title: destination.title || worldName,
      basePosition: null,
      positions: [],
      worldName,
    }
  }

  if (!destination.base_position) return null
  return {
    ...common,
    key: sceneKey('genesis', destination.base_position),
    kind: 'genesis',
    title: destination.title || `Scene at ${destination.base_position}`,
    basePosition: destination.base_position,
    positions: destination.positions?.length ? destination.positions : [destination.base_position],
    worldName: null,
  }
}

// The upstream API can list the same scene twice (same base parcel, or a world name in two cases)
function dedupe(scenes: SceneInfo[]): SceneInfo[] {
  const seen = new Set<string>()
  return scenes.filter(scene => {
    if (seen.has(scene.key)) return false
    seen.add(scene.key)
    return true
  })
}

async function fetchDestinations(params: URLSearchParams, signal?: AbortSignal): Promise<SceneSearchResult> {
  const response = await fetch(`${API_BASE}/destinations?${params}`, { signal })
  const json: DestinationsResponse = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to search scenes')
  }

  const scenes = dedupe((json.data ?? []).map(toSceneInfo).filter((s): s is SceneInfo => s !== null))
  return { scenes, total: json.total ?? scenes.length }
}

/**
 * Searches every scene in Genesis City and every World by name. A query shaped like "x,y" finds
 * the Genesis City scene on that parcel instead.
 */
export async function searchScenes(
  query: string,
  scope: SceneScope,
  offset = 0,
  signal?: AbortSignal
): Promise<SceneSearchResult> {
  const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE), offset: String(offset) })
  const coords = parseCoordinates(query)

  if (coords) {
    // Parcels only exist in Genesis City
    if (scope === 'world') return { scenes: [], total: 0 }
    params.append('pointer', coords)
    params.set('only_places', 'true')
  } else {
    params.set('search', query.trim())
    if (scope === 'genesis') params.set('only_places', 'true')
    if (scope === 'world') params.set('only_worlds', 'true')
  }

  return fetchDestinations(params, signal)
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

export interface SceneLookupResult {
  scenes: SceneInfo[]
  // False when some batch failed: those records show without a title or thumbnail
  complete: boolean
}

/** What the Places API knows about the scenes the BFF holds tags for: titles, thumbnails. */
export async function fetchScenesForPlaces(places: Place[], signal?: AbortSignal): Promise<SceneLookupResult> {
  const pointers = new Set<string>()
  const worlds = new Set<string>()
  for (const place of places) {
    if (place.type === 'world' && place.worldName) worlds.add(place.worldName.toLowerCase())
    // A record on a parcel that cannot exist would get the whole batch refused
    if (place.type === 'scene' && place.basePosition && isParcel(place.basePosition)) pointers.add(place.basePosition)
  }

  const lookups = [
    ...chunk([...pointers], LOOKUP_BATCH_SIZE).map(batch => {
      const params = new URLSearchParams({ only_places: 'true', limit: String(SEARCH_PAGE_SIZE) })
      batch.forEach(pointer => params.append('pointer', pointer))
      return params
    }),
    ...chunk([...worlds], LOOKUP_BATCH_SIZE).map(batch => {
      const params = new URLSearchParams({ only_worlds: 'true', limit: String(SEARCH_PAGE_SIZE) })
      batch.forEach(world => params.append('world_names', world))
      return params
    }),
  ]

  // One refused batch must not leave every other record without its title
  const results = await Promise.allSettled(lookups.map(params => fetchDestinations(params, signal)))
  const scenes = results.flatMap(result => (result.status === 'fulfilled' ? result.value.scenes : []))
  return { scenes: dedupe(scenes), complete: results.every(result => result.status === 'fulfilled') }
}
