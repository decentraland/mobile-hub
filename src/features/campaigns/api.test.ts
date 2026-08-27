import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchActiveCampaigns,
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  fetchCampaignAudit,
  type Campaign,
  type CampaignInput,
} from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

const CAMPAIGN: Campaign = {
  token: 'summer-26',
  target: { type: 'genesis', position: '-9,-9' },
  startsAt: null,
  endsAt: null,
  enabled: true,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  updatedBy: null,
}

const INPUT: CampaignInput = {
  token: 'summer-26',
  targetType: 'genesis',
  targetPosition: '-9,-9',
  startsAt: null,
  endsAt: null,
  enabled: false,
}

describe('fetchActiveCampaigns', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the unauthenticated map the explorer consumes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { campaigns: { 'summer-26': CAMPAIGN } } }))

    const campaigns = await fetchActiveCampaigns()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/campaigns'))
    expect(campaigns).toEqual({ 'summer-26': CAMPAIGN })
  })

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'Internal server error' }))

    await expect(fetchActiveCampaigns()).rejects.toThrow('Internal server error')
  })
})

describe('backoffice campaign endpoints', () => {
  const authenticatedFetch = vi.fn()

  beforeEach(() => {
    authenticatedFetch.mockReset()
  })

  it('lists campaigns from data.campaigns', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { campaigns: [CAMPAIGN] } }))

    await expect(fetchCampaigns(authenticatedFetch)).resolves.toEqual([CAMPAIGN])
    expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/backoffice/campaigns'))
  })

  it('POSTs the whole input on create', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: CAMPAIGN }))

    await expect(createCampaign(authenticatedFetch, INPUT)).resolves.toEqual(CAMPAIGN)
    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(INPUT) })
    )
  })

  it('PUTs only the changed fields', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: CAMPAIGN }))

    await updateCampaign(authenticatedFetch, 'summer-26', { enabled: false })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/summer-26'),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: false }) })
    )
  })

  it('DELETEs by token', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { token: 'summer-26' } }))

    await deleteCampaign(authenticatedFetch, 'summer-26')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/summer-26'),
      { method: 'DELETE' }
    )
  })

  it('reads the audit trail from data.entries', async () => {
    const entry = {
      id: 1,
      token: 'summer-26',
      action: 'create' as const,
      changes: null,
      actor: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      createdAt: '2026-08-25T00:00:00.000Z',
    }
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { entries: [entry] } }))

    await expect(fetchCampaignAudit(authenticatedFetch, 'summer-26')).resolves.toEqual([entry])
    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/summer-26/audit')
    )
  })

  it('escapes the token in the path', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { token: 'a/b' } }))

    await deleteCampaign(authenticatedFetch, 'a/b')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/a%2Fb'),
      { method: 'DELETE' }
    )
  })

  it('propagates the validation error the BFF returns', async () => {
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: false, error: "'targetPosition' must be a parcel like '-9,-9'" })
    )

    await expect(createCampaign(authenticatedFetch, INPUT)).rejects.toThrow(
      "'targetPosition' must be a parcel like '-9,-9'"
    )
  })
})
