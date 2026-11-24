import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Place } from '../places/types'
import { fetchScenesForPlaces, searchScenes, toSceneInfo } from './api'

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

function requestedParams(fetchMock: ReturnType<typeof vi.fn>, call = 0): URLSearchParams {
  const url = new URL(fetchMock.mock.calls[call][0] as string)
  expect(url.pathname).toBe('/destinations')
  return url.searchParams
}

const PLAZA = {
  id: 'd1',
  title: 'Genesis Plaza',
  image: 'https://example.test/plaza.png',
  base_position: '-3,-2',
  positions: ['-3,-2', '-3,-1'],
  world: false,
  world_name: null,
  contact_name: 'Foundation',
  user_count: 8,
}

const BOEDO = {
  id: 'd2',
  title: 'Counter-Strike 1.6',
  base_position: '0,0',
  positions: [],
  world: true,
  world_name: 'Boedo.dcl.eth',
  user_count: 0,
}

function place(overrides: Partial<Place>): Place {
  return {
    id: 'p',
    type: 'scene',
    name: null,
    basePosition: null,
    worldName: null,
    sceneId: null,
    groupId: null,
    groupName: null,
    groupColor: null,
    tags: [],
    positions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('toSceneInfo', () => {
  it('reads a Genesis City scene', () => {
    expect(toSceneInfo(PLAZA)).toMatchObject({
      key: 'genesis:-3,-2',
      kind: 'genesis',
      title: 'Genesis Plaza',
      basePosition: '-3,-2',
      positions: ['-3,-2', '-3,-1'],
      thumbnail: 'https://example.test/plaza.png',
      owner: 'Foundation',
      userCount: 8,
    })
  })

  // Worlds come with base_position "0,0", which must not be read as a parcel
  it('reads a world by its lowercased name, ignoring its 0,0 base', () => {
    expect(toSceneInfo(BOEDO)).toMatchObject({
      key: 'world:boedo.dcl.eth',
      kind: 'world',
      worldName: 'boedo.dcl.eth',
      basePosition: null,
      positions: [],
    })
  })
})

describe('searchScenes', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: [PLAZA, BOEDO, PLAZA], total: 2 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searches Genesis City and Worlds together by default', async () => {
    const result = await searchScenes(' plaza ', 'all')

    const params = requestedParams(fetchMock)
    expect(params.get('search')).toBe('plaza')
    expect(params.get('limit')).toBe('100')
    expect(params.get('offset')).toBe('0')
    expect(params.has('only_places')).toBe(false)
    expect(params.has('only_worlds')).toBe(false)
    // The upstream API can repeat a scene; the list needs it once
    expect(result.scenes.map(s => s.key)).toEqual(['genesis:-3,-2', 'world:boedo.dcl.eth'])
    expect(result.total).toBe(2)
  })

  it('narrows to one side with the scope', async () => {
    await searchScenes('plaza', 'genesis')
    await searchScenes('plaza', 'world', 100)

    expect(requestedParams(fetchMock, 0).get('only_places')).toBe('true')
    expect(requestedParams(fetchMock, 1).get('only_worlds')).toBe('true')
    expect(requestedParams(fetchMock, 1).get('offset')).toBe('100')
  })

  it('looks a parcel up by pointer instead of by name', async () => {
    await searchScenes('-3, -1', 'all')

    const params = requestedParams(fetchMock)
    expect(params.getAll('pointer')).toEqual(['-3,-1'])
    expect(params.get('only_places')).toBe('true')
    expect(params.has('search')).toBe(false)
  })

  it('does not ask for a parcel among Worlds', async () => {
    expect(await searchScenes('1,1', 'world')).toEqual({ scenes: [], total: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'Upstream down' }))
    await expect(searchScenes('plaza', 'all')).rejects.toThrow('Upstream down')
  })
})

describe('fetchScenesForPlaces', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: [], total: 0 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('looks scenes up by base parcel and worlds by name, in batches', async () => {
    const scenes = Array.from({ length: 60 }, (_, i) => place({ id: `s${i}`, basePosition: `${i},0` }))
    const worlds = [place({ id: 'w', type: 'world', worldName: 'Boedo.dcl.eth' })]

    await fetchScenesForPlaces([...scenes, ...worlds])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(requestedParams(fetchMock, 0).getAll('pointer')).toHaveLength(50)
    expect(requestedParams(fetchMock, 0).get('only_places')).toBe('true')
    expect(requestedParams(fetchMock, 1).getAll('pointer')).toHaveLength(10)
    expect(requestedParams(fetchMock, 2).getAll('world_names')).toEqual(['boedo.dcl.eth'])
    expect(requestedParams(fetchMock, 2).get('only_worlds')).toBe('true')
  })

  it('makes no request when there is nothing to look up', async () => {
    expect(await fetchScenesForPlaces([])).toEqual({ scenes: [], complete: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // The Places API refuses a whole request over one pointer it cannot parse
  it('skips records on parcels that cannot exist', async () => {
    await fetchScenesForPlaces([
      place({ id: 'ok', basePosition: '-3,-2' }),
      place({ id: 'junk', basePosition: '2149,3149' }),
    ])

    expect(requestedParams(fetchMock).getAll('pointer')).toEqual(['-3,-2'])
  })

  it('keeps the batches that answered when another one fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: [BOEDO], total: 1 }))

    const result = await fetchScenesForPlaces([
      place({ id: 's', basePosition: '1,1' }),
      place({ id: 'w', type: 'world', worldName: 'boedo.dcl.eth' }),
    ])

    expect(result.complete).toBe(false)
    expect(result.scenes.map(s => s.key)).toEqual(['world:boedo.dcl.eth'])
  })
})
