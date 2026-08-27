import type { CampaignInput, TargetType } from './api'

// All of these mirror the BFF's own validation (mobile-bff src/logic/campaigns.ts). They
// exist to fail fast in the form, not to be the authority — the server still rejects
// anything that slips through.

export const TOKEN_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const TOKEN_MAX_LENGTH = 64

export const POSITION_REGEX = /^-?\d{1,4},-?\d{1,4}$/

// Mirrors Realm.is_dcl_ens in godot-explorer: a name that does not match is treated as a
// realm URL by the client and never resolves to the intended world.
export const WORLD_NAME_REGEX = /^[a-zA-Z0-9]+\.dcl\.eth$/


export interface CampaignFormDraft {
  token: string
  targetType: TargetType
  targetPosition: string
  targetWorld: string
  startsAt: string
  endsAt: string
  enabled: boolean
}

export function emptyDraft(): CampaignFormDraft {
  return {
    token: '',
    targetType: 'genesis',
    targetPosition: '',
    targetWorld: '',
    startsAt: '',
    endsAt: '',
    enabled: false,
  }
}

const INVALID_DATE = Symbol('invalid-date')

// `new Date(garbage).toISOString()` throws rather than returning null, so the invalid case
// has to be caught on the Date itself or it escapes the form as an unhandled exception.
function toIso(value: string): string | null | typeof INVALID_DATE {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? INVALID_DATE : date.toISOString()
}

/**
 * UTC instant -> the `datetime-local` value that denotes it.
 *
 * The input is read back as local wall time, so handing it a sliced UTC string makes the
 * panel show the wrong moment and shifts the window by the browser's offset on every save.
 * Returns '' for an absent or unparseable timestamp (an open-ended bound).
 */
export function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Validates the draft and returns the request body, or the first error to show. */
export function draftToInput(draft: CampaignFormDraft): { input: CampaignInput } | { error: string } {
  const token = draft.token.trim()
  if (token.length === 0 || token.length > TOKEN_MAX_LENGTH || !TOKEN_REGEX.test(token)) {
    return { error: "Token must be kebab-case, at most 64 characters (e.g. 'summer-26')" }
  }

  const startsAtIso = toIso(draft.startsAt)
  if (startsAtIso === INVALID_DATE) {
    return { error: 'Start date is not a valid date' }
  }
  const endsAtIso = toIso(draft.endsAt)
  if (endsAtIso === INVALID_DATE) {
    return { error: 'End date is not a valid date' }
  }
  if (endsAtIso !== null && startsAtIso !== null && endsAtIso <= startsAtIso) {
    return { error: 'End date must be after the start date' }
  }

  const base = {
    token,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    enabled: draft.enabled,
  }

  if (draft.targetType === 'world') {
    const targetWorld = draft.targetWorld.trim()
    if (!WORLD_NAME_REGEX.test(targetWorld)) {
      return { error: "World must look like 'myworld.dcl.eth' (letters and digits only)" }
    }
    return { input: { ...base, targetType: 'world', targetWorld } }
  }

  const targetPosition = draft.targetPosition.trim()
  if (!POSITION_REGEX.test(targetPosition)) {
    return { error: "Parcel must look like '-9,-9'" }
  }
  return { input: { ...base, targetType: 'genesis', targetPosition } }
}

export function describeTarget(target: { type: string; position?: string; name?: string }): string {
  return target.type === 'world' ? String(target.name) : `${target.position}`
}

/** Window state as the client would evaluate it, so the list says why a campaign is dark. */
export function windowState(
  campaign: { enabled: boolean; startsAt: string | null; endsAt: string | null },
  now: Date = new Date()
): 'live' | 'scheduled' | 'expired' | 'disabled' {
  if (!campaign.enabled) return 'disabled'
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return 'scheduled'
  if (campaign.endsAt && new Date(campaign.endsAt) <= now) return 'expired'
  return 'live'
}
