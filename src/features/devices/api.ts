import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export type DeviceDecision = 'exclude' | 'below-minspec'
export type PublicDeviceDecision = DeviceDecision | 'keep'

export interface DeviceSupportEntry {
  soc: string
  decision: DeviceDecision
  updatedAt: string
  updatedBy: string | null
}

export interface BulkUpsertEntry {
  soc: string
  decision: DeviceDecision
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

/** Carries the HTTP status so callers can tell "not authorized" (401/403) apart from any other failure. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function unwrap<T>(response: Response, fallbackError: string): Promise<T> {
  // A route that doesn't exist yet on the target env (e.g. this feature's backend not deployed
  // there) answers with a plain-text body, not the {ok, data} envelope -- parse defensively so
  // that shows up as "<fallback> (404)" instead of a raw JSON.parse SyntaxError.
  let json: ApiResponse<T> | null = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!json || !json.ok || json.data === undefined) {
    throw new ApiError(json?.error || `${fallbackError} (${response.status})`, response.status)
  }

  return json.data
}

/** Public lookup: the client sends the one SoC it detected, no list download. */
export async function fetchDeviceDecision(soc: string): Promise<PublicDeviceDecision> {
  const response = await fetch(`${API_BASE}/device-support?soc=${encodeURIComponent(soc)}`)
  const data = await unwrap<{ soc: string; decision: PublicDeviceDecision }>(
    response,
    'Failed to fetch device support decision'
  )
  return data.decision
}

export async function fetchDeviceSupportList(
  authenticatedFetch: AuthenticatedFetch
): Promise<DeviceSupportEntry[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/device-support`)
  const data = await unwrap<{ entries: DeviceSupportEntry[] }>(
    response,
    'Failed to fetch device support entries'
  )
  return data.entries
}

/** Also used to add a new SoC: there is no separate create endpoint, only this upsert. */
export async function upsertDeviceSupport(
  authenticatedFetch: AuthenticatedFetch,
  soc: string,
  decision: DeviceDecision
): Promise<DeviceSupportEntry> {
  const response = await authenticatedFetch(
    `${API_BASE}/backoffice/device-support/${encodeURIComponent(soc)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }
  )
  return unwrap<DeviceSupportEntry>(response, 'Failed to save device support entry')
}

export async function bulkUpsertDeviceSupport(
  authenticatedFetch: AuthenticatedFetch,
  entries: BulkUpsertEntry[]
): Promise<number> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/device-support`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
  const data = await unwrap<{ count: number }>(response, 'Failed to bulk-import device support entries')
  return data.count
}

export async function deleteDeviceSupport(
  authenticatedFetch: AuthenticatedFetch,
  soc: string
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE}/backoffice/device-support/${encodeURIComponent(soc)}`,
    { method: 'DELETE' }
  )
  await unwrap<{ soc: string }>(response, 'Failed to delete device support entry')
}
