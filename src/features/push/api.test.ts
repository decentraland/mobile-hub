import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchPushCampaigns,
  createPushCampaign,
  uploadPushAudience,
  testSendPushCampaign,
  type PushCampaign,
} from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

const CAMPAIGN: PushCampaign = {
  id: '11111111-1111-1111-1111-111111111111',
  campaignKey: 'spring-event',
  title: 'Come back',
  body: 'Something is happening',
  deepLink: 'decentraland://open?position=0,0',
  imageUrl: null,
  category: 'liveops',
  status: 'draft',
  ttlSeconds: 86400,
  scheduledAt: null,
  audienceCount: 0,
  createdBy: '0xaaa',
  approvedBy: null,
  approvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
}

describe('push api', () => {
  const authenticatedFetch = vi.fn()

  beforeEach(() => {
    authenticatedFetch.mockReset()
  })

  it('surfaces the server error rather than a generic one', async () => {
    // The server's messages are the useful part — "must be approved by someone other than
    // its creator" is a rule the operator needs to read, not a failed request.
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: false, error: 'A campaign must be approved by someone other than its creator' })
    )

    await expect(fetchPushCampaigns(authenticatedFetch)).rejects.toThrow(/other than its creator/)
  })

  it('keeps the warnings that come back with a successful create', async () => {
    // A campaign can be created *and* have something worth saying about it. Dropping the
    // warnings would mean copy silently ships truncated.
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: true, data: CAMPAIGN, warnings: ['title is 100 characters; Android truncates'] })
    )

    const result = await createPushCampaign(authenticatedFetch, {
      campaignKey: 'spring-event',
      title: 'x',
      body: 'y',
      deepLink: 'decentraland://open',
      imageUrl: null,
      ttlSeconds: 86400,
      scheduledAt: null,
    })

    expect(result.data).toEqual(CAMPAIGN)
    expect(result.warnings).toHaveLength(1)
  })

  it('uploads the audience as raw CSV, not JSON', async () => {
    // The server parses it and reports line numbers the operator can find in their file;
    // re-encoding it here would mean two parsers that have to agree.
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: true, data: { received: 2, valid: 2, duplicates: 0, suppressed: 0, invalid: [] } })
    )
    const csv = 'user_id,fcm_token\nuser-a,token-a'

    await uploadPushAudience(authenticatedFetch, CAMPAIGN.id, csv)

    const [, init] = authenticatedFetch.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('text/csv')
    expect(init.body).toBe(csv)
  })

  it('lets the server pick the recipients when none are given', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { results: [] } }))

    await testSendPushCampaign(authenticatedFetch, CAMPAIGN.id, [])

    // An empty array, not an omitted field: the server falls back to its configured list.
    const [, init] = authenticatedFetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ tokens: [] })
  })
})
