import { describe, it, expect } from 'vitest'
import {
  emptyDraft,
  draftToInput,
  draftWarnings,
  validateDraft,
  permissionsFor,
  type PushFormDraft,
} from './validation'
import type { PushCampaign } from './api'

function draft(overrides: Partial<PushFormDraft> = {}): PushFormDraft {
  return { ...emptyDraft(), campaignKey: 'spring-event', title: 'Come back', body: 'Something', ...overrides }
}

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(draft(), { isNew: true })).toEqual({})
  })

  it('refuses a deep link that would fight the sender for its own params', () => {
    // These are appended per delivery. A link that already carries one ends up with the
    // param twice, and which one the client reads is not worth guessing.
    for (const param of ['push_campaign_id', 'push_id', 'source']) {
      const errors = validateDraft(draft({ deepLink: `decentraland://open?${param}=x` }), { isNew: true })
      expect(errors.deepLink).toContain('automatically')
    }
  })

  it('refuses a deep link carrying the install attribution token', () => {
    // `c` is captured sticky by the client as where the user came from. A re-engagement
    // push travelling with one would overwrite that, permanently.
    const errors = validateDraft(draft({ deepLink: 'decentraland://open?c=summer-26' }), { isNew: true })
    expect(errors.deepLink).toContain('install attribution')
  })

  it('refuses a TTL past what FCM will actually retain', () => {
    expect(validateDraft(draft({ ttlHours: '673' }), { isNew: true }).ttlHours).toBeTruthy()
    expect(validateDraft(draft({ ttlHours: '672' }), { isNew: true }).ttlHours).toBeUndefined()
  })

  it('only demands a campaign key when the campaign is new', () => {
    expect(validateDraft(draft({ campaignKey: 'Not Kebab' }), { isNew: true }).campaignKey).toBeTruthy()
    // Editing cannot change the key, so a stored one is never re-validated.
    expect(validateDraft(draft({ campaignKey: 'Not Kebab' }), { isNew: false }).campaignKey).toBeUndefined()
  })
})

describe('draftToInput', () => {
  it('converts the units the form uses into the ones the API takes', () => {
    const input = draftToInput(draft({ ttlHours: '12', imageUrl: '  ' }))

    expect(input.ttlSeconds).toBe(12 * 3600)
    // Blank means "no image", not an empty string the server would have to interpret.
    expect(input.imageUrl).toBeNull()
    expect(input.scheduledAt).toBeNull()
  })
})

describe('draftWarnings', () => {
  it('warns about copy the tray will cut without blocking it', () => {
    expect(draftWarnings(draft())).toEqual([])
    expect(draftWarnings(draft({ title: 'x'.repeat(100) }))[0]).toContain('truncates')
  })
})

describe('permissionsFor', () => {
  const CREATOR = '0xAAA'
  const OTHER = '0xBBB'

  function campaign(overrides: Partial<PushCampaign> = {}): PushCampaign {
    return {
      id: 'id',
      campaignKey: 'spring-event',
      title: 'Come back',
      body: 'Something',
      deepLink: 'decentraland://open',
      imageUrl: null,
      category: 'liveops',
      status: 'draft',
      ttlSeconds: 86400,
      scheduledAt: null,
      audienceCount: 0,
      createdBy: CREATOR.toLowerCase(),
      approvedBy: null,
      approvedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      ...overrides,
    }
  }

  it('will not let the creator approve their own campaign', () => {
    const pending = campaign({ status: 'pending_approval', audienceCount: 10 })

    // Case-insensitive: the wallet comes back checksummed and the server stores lowercase,
    // so comparing them raw would quietly hand the creator an Approve button that 403s.
    expect(permissionsFor(pending, CREATOR).canApprove).toBe(false)
    expect(permissionsFor(pending, CREATOR).approveBlockedReason).toBeTruthy()
    expect(permissionsFor(pending, OTHER).canApprove).toBe(true)
  })

  it('will not offer submit before there is anyone to send to', () => {
    expect(permissionsFor(campaign({ audienceCount: 0 }), CREATOR).canSubmit).toBe(false)
    expect(permissionsFor(campaign({ audienceCount: 1 }), CREATOR).canSubmit).toBe(true)
  })

  it('freezes content and audience once a campaign leaves draft', () => {
    const pending = campaign({ status: 'pending_approval', audienceCount: 5 })
    expect(pending.status === 'pending_approval' && permissionsFor(pending, OTHER).canEdit).toBe(false)
    // The audience can still be corrected while somebody is reviewing it, but not after.
    expect(permissionsFor(pending, OTHER).canUploadAudience).toBe(true)
    expect(permissionsFor(campaign({ status: 'scheduled' }), OTHER).canUploadAudience).toBe(false)
  })

  it('offers cancel right up to the moment sending finishes', () => {
    for (const status of ['draft', 'pending_approval', 'scheduled', 'sending'] as const) {
      expect(permissionsFor(campaign({ status }), OTHER).canCancel).toBe(true)
    }
    // Nothing to stop: those notifications are already on devices.
    expect(permissionsFor(campaign({ status: 'sent' }), OTHER).canCancel).toBe(false)
  })
})
