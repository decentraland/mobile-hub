import type { CampaignInput, TargetType } from './api'

// All of these mirror the BFF's own validation (mobile-bff src/logic/campaigns.ts). They
// exist to fail fast in the form, not to be the authority — the server still rejects
// anything that slips through.

export const TOKEN_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const TOKEN_MAX_LENGTH = 64
export const TITLE_MAX_LENGTH = 120
export const CTA_MAX_LENGTH = 40
export const PLACE_IDS_MAX = 10

export const POSITION_REGEX = /^-?\d{1,4},-?\d{1,4}$/

// Mirrors Realm.is_dcl_ens in godot-explorer: a name that does not match is treated as a
// realm URL by the client and never resolves to the intended world.
export const WORLD_NAME_REGEX = /^[a-zA-Z0-9]+\.dcl\.eth$/

export const PLACE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CampaignFormDraft {
  token: string
  mode: CampaignInput['mode']
  targetType: TargetType
  targetPosition: string
  targetWorld: string
  title: string
  cta: string
  placeIds: string
  startsAt: string
  endsAt: string
  enabled: boolean
}

export function emptyDraft(): CampaignFormDraft {
  return {
    token: '',
    mode: 'ftue',
    targetType: 'genesis',
    targetPosition: '',
    targetWorld: '',
    title: '',
    cta: '',
    placeIds: '',
    startsAt: '',
    endsAt: '',
    enabled: false,
  }
}

export function parsePlaceIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0)
}

/** Validates the draft and returns the request body, or the first error to show. */
export function draftToInput(draft: CampaignFormDraft): { input: CampaignInput } | { error: string } {
  const token = draft.token.trim()
  if (token.length === 0 || token.length > TOKEN_MAX_LENGTH || !TOKEN_REGEX.test(token)) {
    return { error: "Token must be kebab-case, at most 64 characters (e.g. 'summer-26')" }
  }

  const title = draft.title.trim()
  if (title.length > TITLE_MAX_LENGTH) {
    return { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` }
  }

  const cta = draft.cta.trim()
  if (cta.length > CTA_MAX_LENGTH) {
    return { error: `CTA must be at most ${CTA_MAX_LENGTH} characters` }
  }

  const placeIds = parsePlaceIds(draft.placeIds)
  if (placeIds.length > PLACE_IDS_MAX) {
    return { error: `At most ${PLACE_IDS_MAX} place ids` }
  }
  if (placeIds.some(id => !PLACE_ID_REGEX.test(id))) {
    return { error: 'Place ids must be uuids' }
  }
  if (new Set(placeIds).size !== placeIds.length) {
    return { error: 'Place ids must not repeat' }
  }

  const startsAt = draft.startsAt.trim()
  const endsAt = draft.endsAt.trim()
  const startsAtIso = startsAt.length > 0 ? new Date(startsAt).toISOString() : null
  const endsAtIso = endsAt.length > 0 ? new Date(endsAt).toISOString() : null
  if (startsAt.length > 0 && startsAtIso === null) {
    return { error: 'Start date is not a valid date' }
  }
  if (endsAtIso !== null && startsAtIso !== null && endsAtIso <= startsAtIso) {
    return { error: 'End date must be after the start date' }
  }

  const base = {
    token,
    mode: draft.mode,
    title: title.length > 0 ? title : null,
    cta: cta.length > 0 ? cta : null,
    placeIds,
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
