import { sha256 } from 'ethereum-cryptography/sha256'
import { bytesToHex, utf8ToBytes } from 'ethereum-cryptography/utils'
import { config } from '../../config'

// A source build can be pointed at a local creators-data; a release build never reads the variable.
export const API_BASE: string =
  (import.meta.env.DEV && import.meta.env.VITE_CREATOR_FUND_API_URL) || config.get('CREATOR_FUND_API_URL')

const ROOT = `${API_BASE}/v3/creator-fund`
const ADMIN = `${ROOT}/admin`

/** `useAuthenticatedFetch`'s shape: the third argument is extra signed metadata. */
export type AuthenticatedFetch = (
  url: string,
  init?: RequestInit,
  metadata?: Record<string, unknown>
) => Promise<Response>

export type CycleStatus = 'upcoming' | 'running' | 'closed'

export interface Cycle {
  id: number
  start_at: string
  end_at: string
  pool_usdc: number | null
  status: CycleStatus
}

export interface Terms {
  version: number
  title: string
  published_at: string
  content: string
}

export interface NewsItem {
  id: number
  title: string
  body: string
  published_at: string
}

export type CreatorStatus = 'active' | 'suspended'

export interface AdminCreator {
  address: string
  first_name: string
  last_name: string
  email: string
  email_verified_at: string | null
  status: CreatorStatus
  enrolled_at: string
  terms_version: number | null
}

export interface AdminCyclePlace {
  place_id: string
  address: string
  status: 'in_program' | 'not_eligible' | 'replaced'
  reasons: string[]
  title: string | null
  world: boolean
  world_name: string | null
  base_position: string
  first_seen_at: string
  removed_at: string | null
}

export type PlaceExclusionReason = 'content_policy' | 'excluded'
export type CreatorExclusionReason = 'internal' | 'excluded'

export interface PlaceExclusion {
  place_id: string
  reason: PlaceExclusionReason
  note: string | null
  added_at: string
}

export interface CreatorExclusion {
  address: string
  reason: CreatorExclusionReason
  note: string | null
  added_at: string
}

export interface Exclusions {
  places: PlaceExclusion[]
  creators: CreatorExclusion[]
}

export type SweepResult =
  | { status: 'swept'; creators: number; failures: number; inserted: number; updated: number; removed: number }
  | { status: 'skipped'; reason: 'locked' | 'no_running_cycle' }

export interface CycleInput {
  start_at: string
  end_at: string
  pool_usdc: number | null
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      message = body.message ?? body.error ?? message
    } catch {
      // a body that is not JSON keeps the status line
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

async function readNoContent(response: Response): Promise<void> {
  if (!response.ok) {
    await readJson(response)
  }
}

/**
 * A `PUT` whose body is bound to the signature: the service recomputes the body's sha256 and refuses
 * a signature whose `hashPayload` does not match it. `Uint8Array.from` keeps the bytes in this realm,
 * which the hash checks; jsdom's `TextEncoder` hands out another realm's.
 */
function hashPayload(raw: string): string {
  return bytesToHex(sha256(Uint8Array.from(utf8ToBytes(raw))))
}

function putJson<T>(authenticatedFetch: AuthenticatedFetch, url: string, body: unknown): Promise<T> {
  const raw = JSON.stringify(body)
  return authenticatedFetch(
    url,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: raw },
    { hashPayload: hashPayload(raw) }
  ).then(response => readJson<T>(response))
}

function putNoContent(authenticatedFetch: AuthenticatedFetch, url: string, body: unknown): Promise<void> {
  const raw = JSON.stringify(body)
  return authenticatedFetch(
    url,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: raw },
    { hashPayload: hashPayload(raw) }
  ).then(readNoContent)
}

function del(authenticatedFetch: AuthenticatedFetch, url: string): Promise<void> {
  return authenticatedFetch(url, { method: 'DELETE' }).then(readNoContent)
}

/** The gate: 200 for a wallet in the service's admin list, 403 for anyone else. */
export async function isAdmin(authenticatedFetch: AuthenticatedFetch): Promise<boolean> {
  const response = await authenticatedFetch(`${ADMIN}/me`)
  return response.ok
}

export const getCycles = (): Promise<Cycle[]> =>
  fetch(`${ROOT}/cycles`)
    .then(response => readJson<{ cycles: Cycle[] }>(response))
    .then(body => body.cycles)

/** Null until any terms are published. */
export const getTerms = (): Promise<Terms | null> =>
  fetch(`${ROOT}/terms`).then(response => (response.status === 404 ? null : readJson<Terms>(response)))

export const getNews = (): Promise<NewsItem[]> =>
  fetch(`${ROOT}/news`)
    .then(response => readJson<{ news: NewsItem[] }>(response))
    .then(body => body.news)

export const getCreators = (authenticatedFetch: AuthenticatedFetch): Promise<AdminCreator[]> =>
  authenticatedFetch(`${ADMIN}/creators`)
    .then(response => readJson<{ creators: AdminCreator[] }>(response))
    .then(body => body.creators)

export const getExclusions = (authenticatedFetch: AuthenticatedFetch): Promise<Exclusions> =>
  authenticatedFetch(`${ADMIN}/exclusions`).then(response => readJson<Exclusions>(response))

export const getCyclePlaces = (authenticatedFetch: AuthenticatedFetch, cycleId: number): Promise<AdminCyclePlace[]> =>
  authenticatedFetch(`${ADMIN}/cycles/${cycleId}/places`)
    .then(response => readJson<{ places: AdminCyclePlace[] }>(response))
    .then(body => body.places)

export const putCycle = (authenticatedFetch: AuthenticatedFetch, id: number, input: CycleInput): Promise<Cycle> =>
  putJson<Cycle>(authenticatedFetch, `${ADMIN}/cycles/${id}`, input)

export const publishTerms = (
  authenticatedFetch: AuthenticatedFetch,
  version: number,
  input: { title: string; content: string }
): Promise<Terms> => putJson<Terms>(authenticatedFetch, `${ADMIN}/terms/${version}`, input)

export const putNews = (
  authenticatedFetch: AuthenticatedFetch,
  id: number,
  input: { title: string; body: string }
): Promise<NewsItem> => putJson<NewsItem>(authenticatedFetch, `${ADMIN}/news/${id}`, input)

export const deleteNews = (authenticatedFetch: AuthenticatedFetch, id: number): Promise<void> =>
  del(authenticatedFetch, `${ADMIN}/news/${id}`)

export const setCreatorStatus = (
  authenticatedFetch: AuthenticatedFetch,
  address: string,
  status: CreatorStatus
): Promise<AdminCreator> =>
  putJson<AdminCreator>(authenticatedFetch, `${ADMIN}/creators/${address.toLowerCase()}`, { status })

export const excludePlace = (
  authenticatedFetch: AuthenticatedFetch,
  placeId: string,
  input: { reason: PlaceExclusionReason; note: string | null }
): Promise<void> => putNoContent(authenticatedFetch, `${ADMIN}/exclusions/places/${encodeURIComponent(placeId)}`, input)

export const includePlace = (authenticatedFetch: AuthenticatedFetch, placeId: string): Promise<void> =>
  del(authenticatedFetch, `${ADMIN}/exclusions/places/${encodeURIComponent(placeId)}`)

export const excludeCreator = (
  authenticatedFetch: AuthenticatedFetch,
  address: string,
  input: { reason: CreatorExclusionReason; note: string | null }
): Promise<void> => putNoContent(authenticatedFetch, `${ADMIN}/exclusions/creators/${address.toLowerCase()}`, input)

export const includeCreator = (authenticatedFetch: AuthenticatedFetch, address: string): Promise<void> =>
  del(authenticatedFetch, `${ADMIN}/exclusions/creators/${address.toLowerCase()}`)

export const runSweep = (authenticatedFetch: AuthenticatedFetch): Promise<SweepResult> =>
  authenticatedFetch(`${ADMIN}/sweep`, { method: 'PUT' }).then(response => readJson<SweepResult>(response))
