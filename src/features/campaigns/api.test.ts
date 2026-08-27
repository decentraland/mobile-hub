import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchActiveCampaigns,
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type Campaign,
  type CampaignInput,
} from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

const CAMPAIGN: Campaign = {
  token: 'summer2022',
  target: { type: 'genesis', position: '-9,-9' },
}

const INPUT: CampaignInput = {
  token: 'summer2022',
  targetType: 'genesis',
  targetPosition: '-9,-9',
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
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { campaigns: { 'summer2022': CAMPAIGN } } }))

    const campaigns = await fetchActiveCampaigns()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/campaigns'))
    expect(campaigns).toEqual({ 'summer2022': CAMPAIGN })
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

  // The BFF constrains the three target columns as a unit, so the whole target goes up.
  it('PUTs the whole target on update', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: CAMPAIGN }))

    const changes = { targetType: 'world' as const, targetWorld: 'myworld.dcl.eth' }
    await updateCampaign(authenticatedFetch, 'summer2022', changes)

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/summer2022'),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(changes) })
    )
  })

  it('DELETEs by token', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true, data: { token: 'summer2022' } }))

    await deleteCampaign(authenticatedFetch, 'summer2022')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/campaigns/summer2022'),
      { method: 'DELETE' }
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
