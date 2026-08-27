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
}

export function emptyDraft(): CampaignFormDraft {
  return {
    token: '',
    targetType: 'genesis',
    targetPosition: '',
    targetWorld: '',
  }
}

/** Validates the draft and returns the request body, or the first error to show. */
export function draftToInput(draft: CampaignFormDraft): { input: CampaignInput } | { error: string } {
  const token = draft.token.trim()
  if (token.length === 0 || token.length > TOKEN_MAX_LENGTH || !TOKEN_REGEX.test(token)) {
    return { error: "Token must be kebab-case, at most 64 characters (e.g. 'summer2022')" }
  }

  if (draft.targetType === 'world') {
    const targetWorld = draft.targetWorld.trim()
    if (!WORLD_NAME_REGEX.test(targetWorld)) {
      return { error: "World must look like 'myworld.dcl.eth' (letters and digits only)" }
    }
    return { input: { token, targetType: 'world', targetWorld } }
  }

  const targetPosition = draft.targetPosition.trim()
  if (!POSITION_REGEX.test(targetPosition)) {
    return { error: "Parcel must look like '-9,-9'" }
  }
  return { input: { token, targetType: 'genesis', targetPosition } }
}

export function describeTarget(target: { type: string; position?: string; name?: string }): string {
  return target.type === 'world' ? String(target.name) : `${target.position}`
}
