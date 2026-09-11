import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export type PushCampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'

export interface PushCampaign {
  id: string
  campaignKey: string
  title: string
  body: string
  deepLink: string
  imageUrl: string | null
  category: string
  status: PushCampaignStatus
  ttlSeconds: number
  scheduledAt: string | null
  audienceCount: number
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface PushCampaignInput {
  campaignKey: string
  title: string
  body: string
  deepLink: string
  imageUrl: string | null
  ttlSeconds: number
  scheduledAt: string | null
}

/** The key is assigned once; an edit sends only the content. */
export type PushCampaignChanges = Omit<PushCampaignInput, 'campaignKey'>

export interface AudienceReport {
  received: number
  valid: number
  duplicates: number
  suppressed: number
  /** Rows the server could not read, with the line number the operator sees. */
  invalid: { line: number; reason: string }[]
}

export interface CampaignStats {
  attempted: number
  sent: number
  failed: number
  pending: number
  cancelled: number
  inFlight: number
  errors: Record<string, number>
}

export interface TestSendResult {
  ok: boolean
  providerMsgId?: string
  errorCode?: string
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  warnings?: string[]
}

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Creating and editing a campaign can succeed *and* have something worth saying — copy the
 * tray will truncate, for instance. Callers that want the warnings use `unwrapWithWarnings`;
 * the rest get the data and drop them.
 */
async function unwrapWithWarnings<T>(
  response: Response,
  fallbackError: string
): Promise<{ data: T; warnings: string[] }> {
  const json: ApiResponse<T> = await response.json()

  if (!json.ok || json.data === undefined) {
    throw new Error(json.error || fallbackError)
  }

  return { data: json.data, warnings: json.warnings ?? [] }
}

async function unwrap<T>(response: Response, fallbackError: string): Promise<T> {
  return (await unwrapWithWarnings<T>(response, fallbackError)).data
}

function campaignUrl(id: string, suffix = ''): string {
  return `${API_BASE}/backoffice/push/campaigns/${encodeURIComponent(id)}${suffix}`
}

export async function fetchPushCampaigns(
  authenticatedFetch: AuthenticatedFetch
): Promise<PushCampaign[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/push/campaigns`)
  return unwrap<PushCampaign[]>(response, 'Failed to load push campaigns')
}

export async function createPushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  input: PushCampaignInput
): Promise<{ data: PushCampaign; warnings: string[] }> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/push/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return unwrapWithWarnings<PushCampaign>(response, 'Failed to create campaign')
}

export async function updatePushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  id: string,
  changes: PushCampaignChanges
): Promise<{ data: PushCampaign; warnings: string[] }> {
  const response = await authenticatedFetch(campaignUrl(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return unwrapWithWarnings<PushCampaign>(response, 'Failed to update campaign')
}

/**
 * Upload the audience CSV.
 *
 * Sent as raw text rather than JSON because it is a file the operator exported and has not
 * read — parsing it in the browser first would mean two parsers to keep in agreement, and the
 * server's is the one whose line numbers appear in the report.
 */
export async function uploadPushAudience(
  authenticatedFetch: AuthenticatedFetch,
  id: string,
  csv: string
): Promise<AudienceReport> {
  const response = await authenticatedFetch(campaignUrl(id, '/audience'), {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csv,
  })
  return unwrap<AudienceReport>(response, 'Failed to upload audience')
}

export async function testSendPushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  id: string,
  tokens: string[]
): Promise<TestSendResult[]> {
  const response = await authenticatedFetch(campaignUrl(id, '/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // An empty array lets the server fall back to its configured team list.
    body: JSON.stringify({ tokens }),
  })
  const data = await unwrap<{ results: TestSendResult[] }>(response, 'Failed to send test push')
  return data.results
}

export async function submitPushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  id: string
): Promise<PushCampaign> {
  const response = await authenticatedFetch(campaignUrl(id, '/submit'), { method: 'POST' })
  return unwrap<PushCampaign>(response, 'Failed to submit campaign')
}

export async function approvePushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  id: string
): Promise<PushCampaign> {
  const response = await authenticatedFetch(campaignUrl(id, '/approve'), { method: 'POST' })
  return unwrap<PushCampaign>(response, 'Failed to approve campaign')
}

export async function cancelPushCampaign(
  authenticatedFetch: AuthenticatedFetch,
  id: string
): Promise<{ campaign: PushCampaign; cancelledDeliveries: number }> {
  const response = await authenticatedFetch(campaignUrl(id, '/cancel'), { method: 'POST' })
  return unwrap<{ campaign: PushCampaign; cancelledDeliveries: number }>(
    response,
    'Failed to cancel campaign'
  )
}

export async function fetchPushCampaignStats(
  authenticatedFetch: AuthenticatedFetch,
  id: string
): Promise<{ campaign: PushCampaign; stats: CampaignStats }> {
  const response = await authenticatedFetch(campaignUrl(id, '/stats'))
  return unwrap<{ campaign: PushCampaign; stats: CampaignStats }>(
    response,
    'Failed to load campaign stats'
  )
}
