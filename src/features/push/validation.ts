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

export function draftFromCampaign(campaign: PushCampaign): PushFormDraft {
  return {
    campaignKey: campaign.campaignKey,
    title: campaign.title,
    body: campaign.body,
    deepLink: campaign.deepLink,
    imageUrl: campaign.imageUrl ?? '',
    ttlHours: String(campaign.ttlSeconds / 3600),
    scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : '',
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
    scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
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

  return {
    canEdit: campaign.status === 'draft',
    canUploadAudience: campaign.status === 'draft' || pending,
    canSubmit: campaign.status === 'draft' && campaign.audienceCount > 0,
    canApprove: pending && !isCreator,
    approveBlockedReason: pending && isCreator ? 'A campaign must be approved by someone else' : null,
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
