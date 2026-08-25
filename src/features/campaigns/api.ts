import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

// 'ftue' renders the FTUE with campaign content and the target pinned; 'bypass' skips the
// FTUE and boots straight into the target's loading screen.
export type CampaignMode = 'ftue' | 'bypass'

export type TargetType = 'genesis' | 'world'

export type CampaignTarget =
  | { type: 'genesis'; position: string }
  | { type: 'world'; name: string }

export interface Campaign {
  token: string
  mode: CampaignMode
  target: CampaignTarget
  title: string | null
  cta: string | null
  placeIds: string[]
  startsAt: string | null
  endsAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

export interface CampaignAuditEntry {
  id: number
  token: string
  action: 'create' | 'update' | 'delete'
  changes: Record<string, unknown> | null
  actor: string
  createdAt: string
}

export interface CampaignInput {
  token: string
  mode: CampaignMode
  targetType: TargetType
  targetPosition?: string
  targetWorld?: string
  title: string | null
  cta: string | null
  placeIds: string[]
  startsAt: string | null
  endsAt: string | null
  enabled: boolean
}

// The BFF constrains the three target columns as a unit, so a target edit sends targetType
// plus its matching field; a half-target edit is rejected rather than merged.
export type CampaignChanges = Partial<Omit<CampaignInput, 'token'>>

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

function campaignUrl(token: string): string {
  return `${API_BASE}/backoffice/campaigns/${encodeURIComponent(token)}`
}

/** The client-facing map: enabled campaigns inside their active window, keyed by token. */
export async function fetchActiveCampaigns(): Promise<Record<string, Campaign>> {
  const response = await fetch(`${API_BASE}/campaigns`)
  const data = await unwrap<{ campaigns: Record<string, Campaign> }>(
    response,
    'Failed to fetch campaigns'
  )
  return data.campaigns
}

/** Every campaign, enabled or not, in or out of its window. */
export async function fetchCampaigns(authenticatedFetch: AuthenticatedFetch): Promise<Campaign[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/campaigns`)
  const data = await unwrap<{ campaigns: Campaign[] }>(response, 'Failed to fetch campaigns')
  return data.campaigns
}

export async function createCampaign(
  authenticatedFetch: AuthenticatedFetch,
  input: CampaignInput
): Promise<Campaign> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return unwrap<Campaign>(response, 'Failed to create campaign')
}

export async function updateCampaign(
  authenticatedFetch: AuthenticatedFetch,
  token: string,
  changes: CampaignChanges
): Promise<Campaign> {
  const response = await authenticatedFetch(campaignUrl(token), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return unwrap<Campaign>(response, 'Failed to update campaign')
}

export async function deleteCampaign(
  authenticatedFetch: AuthenticatedFetch,
  token: string
): Promise<void> {
  const response = await authenticatedFetch(campaignUrl(token), { method: 'DELETE' })
  await unwrap<{ token: string }>(response, 'Failed to delete campaign')
}

/** Audit trail, newest first. Outlives the campaign, so a deleted token still answers. */
export async function fetchCampaignAudit(
  authenticatedFetch: AuthenticatedFetch,
  token: string
): Promise<CampaignAuditEntry[]> {
  const response = await authenticatedFetch(`${campaignUrl(token)}/audit`)
  const data = await unwrap<{ entries: CampaignAuditEntry[] }>(
    response,
    'Failed to fetch the audit trail'
  )
  return data.entries
}
