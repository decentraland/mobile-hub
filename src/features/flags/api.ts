import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export type FeatureFlags = Record<string, boolean>

export interface FeatureFlag {
  name: string
  enabled: boolean
  description: string | null
  updatedAt: string
  updatedBy: string | null
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

async function unwrap<T>(response: Response, fallbackError: string): Promise<T> {
  const json: ApiResponse<T> = await response.json()

  if (!json.ok || json.data === undefined) {
    throw new Error(json.error || fallbackError)
  }

  return json.data
}

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const response = await fetch(`${API_BASE}/feature-flags`)
  const data = await unwrap<{ flags: FeatureFlags }>(response, 'Failed to fetch feature flags')
  return data.flags
}

export async function fetchFeatureFlagsDetailed(
  authenticatedFetch: AuthenticatedFetch
): Promise<FeatureFlag[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/feature-flags`)
  const data = await unwrap<{ flags: FeatureFlag[] }>(response, 'Failed to fetch feature flags')
  return data.flags
}

export async function createFeatureFlag(
  authenticatedFetch: AuthenticatedFetch,
  input: { name: string; enabled: boolean; description: string | null }
): Promise<FeatureFlag> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/feature-flags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return unwrap<FeatureFlag>(response, 'Failed to create feature flag')
}

export async function updateFeatureFlag(
  authenticatedFetch: AuthenticatedFetch,
  name: string,
  changes: { enabled?: boolean; description?: string | null }
): Promise<FeatureFlag> {
  const response = await authenticatedFetch(
    `${API_BASE}/backoffice/feature-flags/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    }
  )
  return unwrap<FeatureFlag>(response, 'Failed to update feature flag')
}

export async function deleteFeatureFlag(
  authenticatedFetch: AuthenticatedFetch,
  name: string
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE}/backoffice/feature-flags/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  )
  await unwrap<{ name: string }>(response, 'Failed to delete feature flag')
}
