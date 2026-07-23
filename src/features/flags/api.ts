import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export type FeatureFlags = Record<string, boolean>

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

interface FlagsData {
  flags: FeatureFlags
}

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const response = await fetch(`${API_BASE}/feature-flags`)
  const json: ApiResponse<FlagsData> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to fetch feature flags')
  }

  return json.data.flags
}

export async function updateFeatureFlags(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  changes: FeatureFlags
): Promise<FeatureFlags> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/feature-flags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flags: changes }),
  })
  const json: ApiResponse<FlagsData> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to update feature flags')
  }

  return json.data.flags
}
