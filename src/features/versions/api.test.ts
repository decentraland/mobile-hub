import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CURRENT_TRACK,
  LEGACY_TRACK,
  fetchAppVersionTracks,
  fetchAppVersions,
  updateAppVersions,
  type AppVersions,
} from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

const VERSIONS: AppVersions = {
  ios: { minimalRequiredVersionNumber: 6300, recommendedVersionNumber: 6300 },
  android: { minimalRequiredVersionNumber: 6300, recommendedVersionNumber: 6500 },
}

describe('app version tracks', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the bare endpoint, the one older clients call, when no track is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: VERSIONS }))

    await fetchAppVersions()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/app-versions$/))
  })

  it('reads a track by path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: VERSIONS }))

    const versions = await fetchAppVersions(CURRENT_TRACK)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/app-versions/${CURRENT_TRACK}`)
    )
    expect(versions).toEqual(VERSIONS)
  })

  it('lists every track from the backoffice', async () => {
    const tracks = [
      { track: LEGACY_TRACK, ...VERSIONS, updatedAt: '2026-09-10T00:00:00.000Z', updatedBy: null },
      { track: CURRENT_TRACK, ...VERSIONS, updatedAt: '2026-09-10T00:00:00.000Z', updatedBy: null },
    ]
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: { tracks } }))

    const result = await fetchAppVersionTracks(authenticatedFetch)

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/backoffice/app-versions')
    )
    expect(result).toEqual(tracks)
  })

  it('names the track it writes, so a save can never land on the wrong one', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: VERSIONS }))

    await updateAppVersions(authenticatedFetch, CURRENT_TRACK, VERSIONS)

    const [, init] = authenticatedFetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ track: CURRENT_TRACK, ...VERSIONS })
  })

  it('surfaces the server error, which is how the frozen-track cap reaches the operator', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(
      jsonResponse({ ok: false, error: "'ios.minimalRequiredVersionNumber' cannot exceed 101200" })
    )

    await expect(
      updateAppVersions(authenticatedFetch, LEGACY_TRACK, VERSIONS)
    ).rejects.toThrow(/cannot exceed 101200/)
  })
})
