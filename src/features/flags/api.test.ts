import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchFeatureFlags,
  fetchFeatureFlagsDetailed,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  type FeatureFlag,
} from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

const TEST_FLAG: FeatureFlag = {
  name: 'pulse',
  type: 'on-off',
  enabled: false,
  value: null,
  description: 'Pulse transport',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: null,
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

  it('calls GET /feature-flags on the BFF and unwraps the typed flags map', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { flags: { pulse: false, 'dual-channel': true, 'sentry-sample-rate': 0.1, greeting: 'gm' } },
      })
    )

    const flags = await fetchFeatureFlags()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/feature-flags'))
    expect(flags).toEqual({ pulse: false, 'dual-channel': true, 'sentry-sample-rate': 0.1, greeting: 'gm' })
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

describe('fetchFeatureFlagsDetailed', () => {
  it('calls the backoffice list endpoint with the authenticated fetch', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data: { flags: [TEST_FLAG] } }))

    const flags = await fetchFeatureFlagsDetailed(authenticatedFetch)

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags')
    )
    expect(flags).toEqual([TEST_FLAG])
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'Forbidden' }))

    await expect(fetchFeatureFlagsDetailed(authenticatedFetch)).rejects.toThrow('Forbidden')
  })
})

describe('createFeatureFlag', () => {
  it('POSTs a new on-off flag and returns the created row', async () => {
    const created = { ...TEST_FLAG, name: 'shiny-thing' }
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: created }))

    const flag = await createFeatureFlag(authenticatedFetch, {
      name: 'shiny-thing',
      type: 'on-off',
      enabled: false,
      description: 'New toggle',
    })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'shiny-thing',
          type: 'on-off',
          enabled: false,
          description: 'New toggle',
        }),
      }
    )
    expect(flag).toEqual(created)
  })

  it('POSTs a number flag with value and without enabled', async () => {
    const created: FeatureFlag = {
      ...TEST_FLAG,
      name: 'sentry-sample-rate',
      type: 'number',
      value: 0.1,
    }
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: created }))

    const flag = await createFeatureFlag(authenticatedFetch, {
      name: 'sentry-sample-rate',
      type: 'number',
      value: '0.1',
      description: null,
    })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'sentry-sample-rate',
          type: 'number',
          value: '0.1',
          description: null,
        }),
      }
    )
    expect(flag).toEqual(created)
  })

  it('throws the server error message (e.g. duplicate name)', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "Feature flag 'pulse' already exists" }))

    await expect(
      createFeatureFlag(authenticatedFetch, {
        name: 'pulse',
        type: 'on-off',
        enabled: false,
        description: null,
      })
    ).rejects.toThrow("Feature flag 'pulse' already exists")
  })
})

describe('updateFeatureFlag', () => {
  it('PUTs the changes to the per-flag endpoint and returns the updated row', async () => {
    const updated = { ...TEST_FLAG, enabled: true }
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: updated }))

    const flag = await updateFeatureFlag(authenticatedFetch, 'pulse', { enabled: true })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags/pulse'),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    )
    expect(flag).toEqual(updated)
  })

  it('PUTs a value change for a text/number flag', async () => {
    const updated: FeatureFlag = {
      ...TEST_FLAG,
      name: 'sentry-sample-rate',
      type: 'number',
      value: 0.5,
    }
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: updated }))

    const flag = await updateFeatureFlag(authenticatedFetch, 'sentry-sample-rate', { value: '0.5' })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags/sentry-sample-rate'),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '0.5' }),
      }
    )
    expect(flag).toEqual(updated)
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "Feature flag 'nope' not found" }))

    await expect(updateFeatureFlag(authenticatedFetch, 'nope', { enabled: true })).rejects.toThrow(
      "Feature flag 'nope' not found"
    )
  })
})

describe('deleteFeatureFlag', () => {
  it('DELETEs the per-flag endpoint', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data: { name: 'pulse' } }))

    await deleteFeatureFlag(authenticatedFetch, 'pulse')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/feature-flags/pulse'),
      { method: 'DELETE' }
    )
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "Feature flag 'pulse' not found" }))

    await expect(deleteFeatureFlag(authenticatedFetch, 'pulse')).rejects.toThrow(
      "Feature flag 'pulse' not found"
    )
  })
})
