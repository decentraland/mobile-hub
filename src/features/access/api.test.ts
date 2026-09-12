import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchBackofficeAccess } from './api'

const ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

function jsonResponse(body: unknown, status = 200): Response {
  return { status, json: () => Promise.resolve(body) } as Response
}

describe('fetchBackofficeAccess', () => {
  const authenticatedFetch = vi.fn()

  beforeEach(() => {
    authenticatedFetch.mockReset()
  })

  it('calls GET /backoffice/me with the signed fetch and unwraps the answer', async () => {
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: true, data: { address: ADDRESS, allowed: true } })
    )

    const access = await fetchBackofficeAccess(authenticatedFetch)

    expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/backoffice/me'))
    expect(access).toEqual({ address: ADDRESS, allowed: true })
  })

  // A denial is an answer, not a failure - that is what lets the UI tell
  // "you are not allowed" apart from "the check itself broke".
  it('resolves with allowed: false instead of throwing when the wallet is not allowed', async () => {
    authenticatedFetch.mockResolvedValue(
      jsonResponse({ ok: true, data: { address: ADDRESS, allowed: false } })
    )

    await expect(fetchBackofficeAccess(authenticatedFetch)).resolves.toEqual({
      address: ADDRESS,
      allowed: false,
    })
  })

  it('throws the error from the envelope when the request is rejected', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: false, error: 'Unauthorized' }, 401))

    await expect(fetchBackofficeAccess(authenticatedFetch)).rejects.toThrow('Unauthorized')
  })

  it('throws a fallback message when the envelope carries no error', async () => {
    authenticatedFetch.mockResolvedValue(jsonResponse({ ok: true }))

    await expect(fetchBackofficeAccess(authenticatedFetch)).rejects.toThrow(
      'Failed to check backoffice permissions'
    )
  })

  // e.g. the endpoint is not deployed yet, or a proxy answered with HTML
  it('reports the status when the body is not JSON', async () => {
    authenticatedFetch.mockResolvedValue({
      status: 404,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response)

    await expect(fetchBackofficeAccess(authenticatedFetch)).rejects.toThrow(
      'Could not check permissions (HTTP 404)'
    )
  })

  it('propagates a network failure', async () => {
    authenticatedFetch.mockRejectedValue(new Error('Failed to fetch'))

    await expect(fetchBackofficeAccess(authenticatedFetch)).rejects.toThrow('Failed to fetch')
  })
})
