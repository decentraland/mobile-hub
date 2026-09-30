import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  fetchDeviceDecision,
  fetchDeviceSupportList,
  upsertDeviceSupport,
  bulkUpsertDeviceSupport,
  deleteDeviceSupport,
  type DeviceSupportEntry,
} from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response
}

function textResponse(text: string, status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new SyntaxError(`Unexpected token '${text[0]}', "${text}" is not valid JSON`)),
  } as Response
}

const TEST_ENTRY: DeviceSupportEntry = {
  soc: 'EXYNOS 7420',
  decision: 'exclude',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: null,
}

describe('fetchDeviceDecision', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls GET /device-support with the SoC query param and returns the decision', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { soc: 'SM7125', decision: 'below-minspec' } }))

    const decision = await fetchDeviceDecision('SM7125')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/device-support?soc=SM7125'))
    expect(decision).toBe('below-minspec')
  })

  it('throws the server error message when the envelope is ok: false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "'soc' is required" }, 400))

    await expect(fetchDeviceDecision('')).rejects.toThrow("'soc' is required")
  })

  it('falls back to a status-coded message when the route answers with a non-JSON body', async () => {
    // What the real BFF returns today for this route on an env that hasn't deployed PR #93 yet.
    fetchMock.mockResolvedValue(textResponse('Not found', 404))

    await expect(fetchDeviceDecision('SM8750')).rejects.toThrow('Failed to fetch device support decision (404)')
  })

  it('throws an ApiError carrying the response status, not just a plain Error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'nope' }, 400))

    const error = await fetchDeviceDecision('SM8750').catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
  })

  it('carries the 404 status through on a non-JSON body too', async () => {
    fetchMock.mockResolvedValue(textResponse('Not found', 404))

    const error = await fetchDeviceDecision('SM8750').catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})

describe('fetchDeviceSupportList', () => {
  it('calls the backoffice list endpoint with the authenticated fetch', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data: { entries: [TEST_ENTRY] } }))

    const entries = await fetchDeviceSupportList(authenticatedFetch)

    expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/backoffice/device-support'))
    expect(entries).toEqual([TEST_ENTRY])
  })

  it('throws an ApiError with status 403 for a signed-in wallet outside ALLOWED_USERS', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: 'Forbidden: User not in allowed list' }, 403))

    const error = await fetchDeviceSupportList(authenticatedFetch).catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'Forbidden' }, 403))

    await expect(fetchDeviceSupportList(authenticatedFetch)).rejects.toThrow('Forbidden')
  })
})

describe('upsertDeviceSupport', () => {
  it('PUTs the decision to the per-soc endpoint and returns the saved row', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: TEST_ENTRY }))

    const entry = await upsertDeviceSupport(authenticatedFetch, 'EXYNOS 7420', 'exclude')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/device-support/EXYNOS%207420'),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'exclude' }),
      }
    )
    expect(entry).toEqual(TEST_ENTRY)
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: 'Forbidden: User not in allowed list' }, 403))

    await expect(upsertDeviceSupport(authenticatedFetch, 'SM8750', 'exclude')).rejects.toThrow(
      'Forbidden: User not in allowed list'
    )
  })
})

describe('bulkUpsertDeviceSupport', () => {
  it('PUTs the entries array to the bulk endpoint and returns the count', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: { count: 2 } }))
    const entries = [
      { soc: 'EXYNOS 7420', decision: 'exclude' as const },
      { soc: 'SM6115', decision: 'below-minspec' as const },
    ]

    const count = await bulkUpsertDeviceSupport(authenticatedFetch, entries)

    expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/backoffice/device-support'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(count).toBe(2)
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "'entries' must have at most 1000 items" }, 400))

    await expect(bulkUpsertDeviceSupport(authenticatedFetch, [])).rejects.toThrow(
      "'entries' must have at most 1000 items"
    )
  })
})

describe('deleteDeviceSupport', () => {
  it('DELETEs the per-soc endpoint', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data: { soc: 'EXYNOS 7420' } }))

    await deleteDeviceSupport(authenticatedFetch, 'EXYNOS 7420')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/device-support/EXYNOS%207420'),
      { method: 'DELETE' }
    )
  })

  it('throws the server error message on failure', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "No device-support entry for 'nope'" }, 404))

    await expect(deleteDeviceSupport(authenticatedFetch, 'nope')).rejects.toThrow(
      "No device-support entry for 'nope'"
    )
  })
})
