import { describe, it, expect, vi, afterEach } from 'vitest'
import { sha256 } from 'ethereum-cryptography/sha256'
import { bytesToHex, utf8ToBytes } from 'ethereum-cryptography/utils'
import { getTerms, isAdmin, putCycle, setCreatorStatus, includePlace } from './api'

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  } as Response
}

const CYCLE = { start_at: '2026-11-01T00:00:00.000Z', end_at: '2026-11-15T00:00:00.000Z', pool_usdc: 10000 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isAdmin', () => {
  it('is whatever GET /admin/me answers: 200 yes, 403 no', async () => {
    expect(await isAdmin(vi.fn().mockResolvedValue(response(200, { address: '0xabc' })))).toBe(true)
    expect(await isAdmin(vi.fn().mockResolvedValue(response(403, { error: 'Forbidden' })))).toBe(false)
  })
})

describe('a write', () => {
  it('is a PUT bound to its body by the hashPayload the service recomputes', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(response(201, { id: 3, ...CYCLE, status: 'upcoming' }))

    const cycle = await putCycle(authenticatedFetch, 3, CYCLE)

    const body = JSON.stringify(CYCLE)
    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/v3\/creator-fund\/admin\/cycles\/3$/),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
      { hashPayload: bytesToHex(sha256(Uint8Array.from(utf8ToBytes(body)))) }
    )
    expect(cycle.id).toBe(3)
  })

  it('lowercases the wallet in the path, since the signed path is compared lowercased', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(response(200, { address: '0xabc', status: 'suspended' }))

    await setCreatorStatus(authenticatedFetch, '0xABCDEF', 'suspended')

    expect(authenticatedFetch.mock.calls[0][0]).toMatch(/\/admin\/creators\/0xabcdef$/)
  })

  it('surfaces the service message on a refusal', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(response(409, { error: 'Conflict', message: 'the dates overlap cycle 2' }))

    await expect(putCycle(authenticatedFetch, 3, CYCLE)).rejects.toThrow('the dates overlap cycle 2')
  })

  it('treats a 204 as done and a 403 with no detail as an error', async () => {
    await expect(includePlace(vi.fn().mockResolvedValue(response(204)), 'p')).resolves.toBeUndefined()
    await expect(includePlace(vi.fn().mockResolvedValue(response(403, { error: 'Forbidden' })), 'p')).rejects.toThrow(
      'Forbidden'
    )
  })
})

describe('getTerms', () => {
  it('is null before any terms are published', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404, { error: 'Not Found' })))

    await expect(getTerms()).resolves.toBeNull()
  })
})
