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

/** What kind of place a feed row's push opens; the campaign serving the slice owns the copy. */
export type FeedDestinationKind = 'scene' | 'plaza' | 'discover'

/** The lifecycle triggers the warehouse publishes: days since the install's first session. */
export const FEED_TRIGGER_KEYS = ['d1', 'd3', 'd7', 'd15', 'd30'] as const
export const FEED_DESTINATION_KINDS: readonly FeedDestinationKind[] = ['scene', 'plaza', 'discover']

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
  /**
   * Filled by the warehouse feed instead of a CSV, and never finishes: a drained queue goes
   * back to `scheduled` for the next ingest. `audienceCount` is then everyone ever queued.
   */
  isRecurring: boolean
  /** The slice of the feed this campaign serves; both null for a hand-uploaded one. */
  triggerKey: string | null
  destinationKind: FeedDestinationKind | null
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
  /** Only on create. The server accepts the slice only together with `isRecurring`. */
  isRecurring?: boolean
  triggerKey?: string | null
  destinationKind?: FeedDestinationKind | null
}

/**
 * The key and the slice are assigned once; an edit sends only the content, and the server
 * leaves what a campaign is fed by as it was.
 */
export type PushCampaignChanges = Omit<
  PushCampaignInput,
  'campaignKey' | 'isRecurring' | 'triggerKey' | 'destinationKind'
>

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

/** What one read of the warehouse feed did. */
export interface FeedSyncReport {
  rowsRead: number
  /** Rows the server refused, counted by reason. */
  rejected: Record<string, number>
  /** `trigger/kind` pairs the feed produced rows for that no campaign declares. */
  unservedSlices: string[]
  /** Pairs whose campaign exists but is not approved yet. */
  notAcceptingSlices: string[]
  queued: number
  alreadyQueued: number
  suppressed: number
}

/** One campaign's sends on one UTC day. */
export interface DailySendRow {
  day: string
  campaignKey: string
  sent: number
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
  // Every handler answers `{ ok, data | error }`, so the useful message is in the body — but
  // an ingress 500, a proxy 502 or an auth redirect answers with HTML, and parsing that first
  // buried the real problem under `Unexpected token '<'`.
  let json: ApiResponse<T>
  try {
    json = await response.json()
  } catch {
    throw new Error(
      response.ok
        ? fallbackError
        : `${response.status} ${response.statusText}`.trim() || fallbackError
    )
  }

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

/**
 * Read the warehouse feed now rather than at the next hourly pass. Sends nothing by itself:
 * it only queues rows onto recurring campaigns a second person already approved, and the
 * same read twice is a no-op. What it is for is the report.
 */
export async function syncPushFeed(authenticatedFetch: AuthenticatedFetch): Promise<FeedSyncReport> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/push/feed/sync`, { method: 'POST' })
  return unwrap<FeedSyncReport>(response, 'Failed to read the warehouse feed')
}

export async function fetchDailySends(
  authenticatedFetch: AuthenticatedFetch,
  days: number
): Promise<DailySendRow[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/push/stats/daily?days=${days}`)
  const data = await unwrap<{ days: number; rows: DailySendRow[] }>(response, 'Failed to load sends per day')
  return data.rows
}
