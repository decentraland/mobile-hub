import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export interface BackofficeAccess {
  /** Address the BFF recovered from the signed request */
  address: string
  /** Whether that address is on the BFF's ALLOWED_USERS list */
  allowed: boolean
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Asks the BFF whether the signed-in wallet may use the backoffice.
 *
 * The endpoint answers 200 with `allowed: false` rather than 403, so a denial is
 * a resolved answer and only a network/server failure throws. That distinction is
 * what lets the UI show "no permissions" instead of a generic error.
 */
export async function fetchBackofficeAccess(
  authenticatedFetch: AuthenticatedFetch
): Promise<BackofficeAccess> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/me`)

  let json: ApiResponse<BackofficeAccess>
  try {
    json = await response.json()
  } catch {
    // A non-JSON body means we never reached the endpoint (proxy error, or a BFF
    // too old to expose it). Report the status rather than a JSON parse error.
    throw new Error(`Could not check permissions (HTTP ${response.status})`)
  }

  if (!json.ok || json.data === undefined) {
    throw new Error(json.error || 'Failed to check backoffice permissions')
  }

  return json.data
}
