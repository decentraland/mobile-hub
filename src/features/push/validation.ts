import type { PushCampaign, PushCampaignInput, PushCampaignStatus } from './api'

// Mirrors src/logic/push.ts in mobile-bff. The server is the authority — these exist so the
// form can say what is wrong while somebody is typing, instead of after a round trip.

export const CAMPAIGN_KEY_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const CAMPAIGN_KEY_MAX_LENGTH = 64

/** Past these Android truncates in the tray. Advisory: the notification still delivers. */
export const TITLE_SOFT_LIMIT = 65
export const BODY_SOFT_LIMIT = 240

export const TTL_MAX_SECONDS = 2419200
export const TTL_DEFAULT_SECONDS = 86400

/** Params the sender appends per delivery, or that belong to install attribution. */
export const RESERVED_DEEP_LINK_PARAMS = ['push_campaign_id', 'push_id', 'source', 'c']

export interface PushFormDraft {
  campaignKey: string
  title: string
  body: string
  deepLink: string
  imageUrl: string
  ttlHours: string
  scheduledAt: string
}

export function emptyDraft(): PushFormDraft {
  return {
    campaignKey: '',
    title: '',
    body: '',
    deepLink: 'decentraland://open?position=0,0',
    imageUrl: '',
    ttlHours: String(TTL_DEFAULT_SECONDS / 3600),
    scheduledAt: '',
  }
}

/**
 * `datetime-local` holds a wall clock with no zone, and the browser reads it as the operator's
 * own. The API speaks UTC, so the two need converting rather than slicing.
 *
 * Slicing the ISO string put a UTC wall clock into an input read as local: the operator saw a
 * time wrong by their offset, and saving parsed it back as local, moving the campaign by that
 * offset again on every edit. It only looked right in a UTC browser.
 */
function toLocalInputValue(iso: string): string {
  const instant = new Date(iso)
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function fromLocalInputValue(value: string): string {
  // Correct precisely because the input is genuinely local: `new Date` parses a zone-less
  // string in local time, so this is the inverse of the above.
  return new Date(value).toISOString()
}

export function draftFromCampaign(campaign: PushCampaign): PushFormDraft {
  return {
    campaignKey: campaign.campaignKey,
    title: campaign.title,
    body: campaign.body,
    deepLink: campaign.deepLink,
    imageUrl: campaign.imageUrl ?? '',
    ttlHours: String(campaign.ttlSeconds / 3600),
    scheduledAt: campaign.scheduledAt ? toLocalInputValue(campaign.scheduledAt) : '',
  }
}

export type DraftErrors = Partial<Record<keyof PushFormDraft, string>>

export function validateDraft(draft: PushFormDraft, options: { isNew: boolean }): DraftErrors {
  const errors: DraftErrors = {}

  if (options.isNew) {
    const key = draft.campaignKey.trim()
    if (!key) {
      errors.campaignKey = 'Required'
    } else if (key.length > CAMPAIGN_KEY_MAX_LENGTH) {
      errors.campaignKey = `At most ${CAMPAIGN_KEY_MAX_LENGTH} characters`
    } else if (!CAMPAIGN_KEY_REGEX.test(key)) {
      errors.campaignKey = "Kebab-case only, e.g. 'spring-event'"
    }
  }

  if (!draft.title.trim()) {
    errors.title = 'Required'
  }
  if (!draft.body.trim()) {
    errors.body = 'Required'
  }

  const deepLink = draft.deepLink.trim()
  if (!deepLink.startsWith('decentraland://')) {
    errors.deepLink = "Must start with 'decentraland://'"
  } else {
    const reserved = RESERVED_DEEP_LINK_PARAMS.find(param =>
      new RegExp(`[?&]${param}=`).test(deepLink)
    )
    if (reserved) {
      errors.deepLink =
        reserved === 'c'
          ? "'c' is the install attribution token and must not be reused for push"
          : `'${reserved}' is added automatically when sending`
    } else {
      // Assigned only when there is one: `errors.deepLink = undefined` still creates the key,
      // and callers ask Object.keys() whether the form is valid.
      const routeError = deepLinkRouteError(deepLink)
      if (routeError) {
        errors.deepLink = routeError
      }
    }
  }

  if (draft.imageUrl.trim() && !/^https:\/\//.test(draft.imageUrl.trim())) {
    errors.imageUrl = 'Must be an https URL'
  }

  const ttlHours = Number(draft.ttlHours)
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    errors.ttlHours = 'Must be a positive number of hours'
  } else if (ttlHours * 3600 > TTL_MAX_SECONDS) {
    errors.ttlHours = 'At most 672 hours (four weeks) — FCM stops retaining past that'
  }

  if (draft.scheduledAt && Number.isNaN(Date.parse(draft.scheduledAt))) {
    errors.scheduledAt = 'Not a valid date'
  }

  return errors
}

export function draftToInput(draft: PushFormDraft): PushCampaignInput {
  return {
    campaignKey: draft.campaignKey.trim(),
    title: draft.title.trim(),
    body: draft.body.trim(),
    deepLink: draft.deepLink.trim(),
    imageUrl: draft.imageUrl.trim() || null,
    ttlSeconds: Math.round(Number(draft.ttlHours) * 3600),
    scheduledAt: draft.scheduledAt ? fromLocalInputValue(draft.scheduledAt) : null,
  }
}

/** Copy that will be visually cut off on a device. Shown, never blocking. */
export function draftWarnings(draft: PushFormDraft): string[] {
  const warnings: string[] = []
  if (draft.title.trim().length > TITLE_SOFT_LIMIT) {
    warnings.push(`Title is ${draft.title.trim().length} characters; Android truncates past ~${TITLE_SOFT_LIMIT}`)
  }
  if (draft.body.trim().length > BODY_SOFT_LIMIT) {
    warnings.push(`Body is ${draft.body.trim().length} characters; Android truncates past ~${BODY_SOFT_LIMIT}`)
  }
  return warnings
}

/**
 * What the operator is allowed to do next, given the campaign and who is looking at it.
 *
 * Kept in one place because the rules are about more than status: approval is refused to the
 * creator, which is the whole point of the step, and the UI has to say so rather than offer a
 * button that will come back 403.
 */
/**
 * Mirrors the server's allow-list of campaign destinations. A block-list would not hold: the
 * client parses around twenty deep-link params, and `dclenv` alone switches environment and
 * signs the user out — on every device in the audience, since nobody has to tap a campaign
 * link for it to arrive. The server revalidates; this just says so before the round trip.
 */
const ALLOWED_DEEP_LINK_ROUTES: Record<string, string[]> = {
  open: ['position', 'location', 'realm'],
  events: ['id'],
  places: ['id'],
}

export function deepLinkRouteError(deepLink: string): string | null {
  let url: URL
  try {
    url = new URL(deepLink)
  } catch {
    return 'Not a valid link'
  }
  const allowed = ALLOWED_DEEP_LINK_ROUTES[url.host]
  if (!allowed) {
    return `Must point at one of: ${Object.keys(ALLOWED_DEEP_LINK_ROUTES).join(', ')}`
  }
  const rejected = [...url.searchParams.keys()].find(param => !allowed.includes(param))
  return rejected ? `'${rejected}' is not allowed here; '${url.host}' accepts: ${allowed.join(', ')}` : null
}

export function permissionsFor(
  campaign: PushCampaign,
  viewer: string | undefined
): {
  canEdit: boolean
  canUploadAudience: boolean
  canSubmit: boolean
  canApprove: boolean
  approveBlockedReason: string | null
  canCancel: boolean
} {
  const isCreator = !!viewer && viewer.toLowerCase() === campaign.createdBy.toLowerCase()
  const pending = campaign.status === 'pending_approval'

  // Why approval is unavailable, or null when it is available. Both reasons mirror a server
  // gate, so the button explains itself instead of the click coming back 4xx.
  let approveBlockedReason: string | null = null
  if (pending && isCreator) {
    approveBlockedReason = 'A campaign must be approved by someone else'
  } else if (pending && campaign.audienceCount === 0) {
    approveBlockedReason = 'This campaign reaches nobody — upload an audience first'
  }

  return {
    canEdit: campaign.status === 'draft',
    canUploadAudience: campaign.status === 'draft' || pending,
    canSubmit: campaign.status === 'draft' && campaign.audienceCount > 0,
    canApprove: pending && approveBlockedReason === null,
    approveBlockedReason,
    canCancel: ['draft', 'pending_approval', 'scheduled', 'sending'].includes(campaign.status),
  }
}

const STATUS_LABELS: Record<PushCampaignStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function statusLabel(status: PushCampaignStatus): string {
  return STATUS_LABELS[status] ?? status
}
