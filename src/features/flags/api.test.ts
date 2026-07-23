import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFeatureFlags, updateFeatureFlags } from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

describe('fetchFeatureFlags', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls GET /feature-flags on the BFF and unwraps the flags map', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { flags: { pulse: false, 'dual-channel': true } } })
    )

    const flags = await fetchFeatureFlags()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/feature-flags'))
    expect(flags).toEqual({ pulse: false, 'dual-channel': true })
  })

  it('throws the server error message when the envelope is ok: false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'Internal server error' }))

    await expect(fetchFeatureFlags()).rejects.toThrow('Internal server error')
  })

  it('throws a generic message when the envelope has no error field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }))

    await expect(fetchFeatureFlags()).rejects.toThrow('Failed to fetch feature flags')
  })
})

describe('updateFeatureFlags', () => {
  it('PUTs the partial changes wrapped in flags and returns the full map', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: true, data: { flags: { pulse: true, 'dual-channel': true } } })
      )

    const flags = await updateFeatureFlags(authenticatedFetch, { pulse: true })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags'),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: { pulse: true } }),
      }
    )
    expect(flags).toEqual({ pulse: true, 'dual-channel': true })
  })

  it('throws the server error message when the envelope is ok: false', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "Unknown feature flag: 'nope'" }))

    await expect(updateFeatureFlags(authenticatedFetch, { nope: true })).rejects.toThrow(
      "Unknown feature flag: 'nope'"
    )
  })

  it('throws a generic message when the envelope has no error field', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: false }))

    await expect(updateFeatureFlags(authenticatedFetch, { pulse: true })).rejects.toThrow(
      'Failed to update feature flags'
    )
  })
})
