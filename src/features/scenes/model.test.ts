import { describe, it, expect } from 'vitest'
import type { Place } from '../places/types'
import {
  findPlace,
  indexPlaces,
  inventoryRows,
  iosRuleBlock,
  iosStatus,
  listSource,
  featuredOutsideIos,
  matchesFilter,
  sortTagsForFilter,
  deepLink,
  matchesText,
  parseCoordinates,
  placeInputFor,
  placesSiteUrl,
  refreshRow,
  sceneKey,
  tagCounts,
  toRow,
  withIosStatus,
  withTag,
  type SceneInfo,
} from './model'

function place(overrides: Partial<Place>): Place {
  return {
    id: 'p1',
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

function genesis(base: string, positions: string[] = [base], title = `Scene ${base}`): SceneInfo {
  return {
    key: sceneKey('genesis', base),
    kind: 'genesis',
    title,
    description: null,
    thumbnail: null,
    basePosition: base,
    positions,
    worldName: null,
    owner: null,
    userCount: 0,
    contentRating: null,
    categories: [],
  }
}

function world(name: string, title = name): SceneInfo {
  return {
    key: sceneKey('world', name),
    kind: 'world',
    title,
    description: null,
    thumbnail: null,
    basePosition: null,
    positions: [],
    worldName: name,
    owner: null,
    userCount: 0,
    contentRating: null,
    categories: [],
  }
}

describe('iosRuleBlock', () => {
  it('names the rating or the casino category the iOS block list hides', () => {
    expect(iosRuleBlock({ ...world('a.dcl.eth'), contentRating: 'A' })).toBe('Rated A (adult)')
    expect(iosRuleBlock({ ...world('r.dcl.eth'), contentRating: 'r' })).toBe('Rated R (restricted)')
    expect(iosRuleBlock({ ...genesis('1,1'), categories: ['game', 'Casino'] })).toBe('Casino')
  })

  it('leaves unrated, teen and everyone scenes alone, and rows Places does not list', () => {
    for (const contentRating of ['RP', 'PR', 'T', 'E', null]) {
      expect(iosRuleBlock({ ...genesis('1,1'), contentRating, categories: ['art'] })).toBeNull()
    }
    expect(iosRuleBlock(null)).toBeNull()
  })
})

describe('iOS status', () => {
  it('reads allowed, banned, unset, and a scene carrying both', () => {
    expect(iosStatus(['allowed_ios', 'featured'])).toBe('allowed')
    expect(iosStatus(['banned_ios'])).toBe('banned')
    expect(iosStatus(['featured'])).toBe('unset')
    expect(iosStatus(['allowed_ios', 'banned_ios'])).toBe('conflict')
  })

  // The iOS app lists anything with allowed_ios, so banning has to take it away
  it('swaps allowed for banned and keeps the other tags', () => {
    expect(withIosStatus(['featured', 'allowed_ios'], 'banned')).toEqual(['featured', 'banned_ios'])
    expect(withIosStatus(['allowed_ios', 'banned_ios'], 'allowed')).toEqual(['allowed_ios'])
    expect(withIosStatus(['featured', 'banned_ios'], 'unset')).toEqual(['featured'])
  })

  it('treats typing an iOS tag by hand the same as the toggle', () => {
    expect(withTag(['allowed_ios', 'curated'], ' Banned_IOS ')).toEqual(['curated', 'banned_ios'])
    expect(withTag(['curated'], 'Mobile Featured')).toEqual(['curated', 'mobile_featured'])
    expect(withTag(['curated'], 'curated')).toEqual(['curated'])
  })

  it('lists a place with both tags under each of them, so it can be found and fixed', () => {
    const row = toRow(genesis('1,1'), indexPlaces([place({ basePosition: '1,1', tags: ['allowed_ios', 'banned_ios'] })]))
    expect(matchesFilter(row, { kind: 'tag', tag: 'allowed_ios' })).toBe(true)
    expect(matchesFilter(row, { kind: 'tag', tag: 'banned_ios' })).toBe(true)
    expect(matchesFilter(row, { kind: 'ios-unset' })).toBe(false)
  })

  // The carousel request carries both tags, but the BFF applies only `featured`
  it('flags a featured place the iOS carousel would show without allowed_ios', () => {
    expect(featuredOutsideIos(['featured'])).toBe(true)
    expect(featuredOutsideIos(['featured', 'banned_ios'])).toBe(true)
    expect(featuredOutsideIos(['featured', 'allowed_ios'])).toBe(false)
    expect(featuredOutsideIos(['allowed_ios'])).toBe(false)
  })
})

describe('matching Places API results to BFF records', () => {
  it('matches worlds by name regardless of case', () => {
    const index = indexPlaces([place({ id: 'w', type: 'world', worldName: 'Boedo.dcl.eth' })])
    expect(findPlace(index, world('boedo.dcl.eth'))?.id).toBe('w')
  })

  // A redeploy can move the base parcel; the tags must still be found
  it('matches a Genesis City scene on any parcel it shares with a record', () => {
    const index = indexPlaces([place({ id: 'old', basePosition: '10,10', positions: ['10,10', '10,11'] })])
    expect(findPlace(index, genesis('10,11', ['10,11', '10,12']))?.id).toBe('old')
    expect(findPlace(index, genesis('20,20'))).toBeNull()
  })

  it('never matches a world to a Genesis City parcel', () => {
    const index = indexPlaces([place({ id: 's', basePosition: '0,0', positions: ['0,0'] })])
    expect(findPlace(index, world('zero.dcl.eth'))).toBeNull()
  })

  it('refreshes a selected search result that got its first tag since it was selected', () => {
    const info = genesis('5,5')
    const selected = toRow(info, indexPlaces([]))
    const created = place({ id: 'new', basePosition: '5,5', positions: ['5,5'], tags: ['curated'] })

    expect(refreshRow(selected, [created], indexPlaces([created])).place?.id).toBe('new')
  })
})

describe('inventoryRows', () => {
  it('attaches Places API details and falls back to the record when the scene is no longer listed', () => {
    const places = [
      place({ id: 'a', basePosition: '1,1', positions: ['1,1'], tags: ['allowed_ios'] }),
      place({ id: 'b', type: 'world', worldName: 'gone.dcl.eth' }),
    ]
    const rows = inventoryRows(places, [genesis('1,1', ['1,1'], 'Alpha Plaza')])

    expect(rows.map(r => [r.key, r.info?.title ?? null])).toEqual([
      ['genesis:1,1', 'Alpha Plaza'],
      ['world:gone.dcl.eth', null],
    ])
  })

  it('keeps one key per row when two records resolve to the same scene', () => {
    const places = [
      place({ id: 'a', basePosition: '1,1', positions: ['1,1'] }),
      place({ id: 'b', basePosition: '1,2', positions: ['1,2'] }),
    ]
    const rows = inventoryRows(places, [genesis('1,1', ['1,1', '1,2'])])
    expect(new Set(rows.map(r => r.key)).size).toBe(2)
  })
})

describe('search input', () => {
  it('recognises parcel coordinates', () => {
    expect(parseCoordinates(' -12 , 34 ')).toBe('-12,34')
    expect(parseCoordinates('12,34,5')).toBeNull()
    expect(parseCoordinates('2149,3149')).toBeNull()
    expect(parseCoordinates('boedo')).toBeNull()
  })

  it('searches every place unless a tag filter narrows it to the hub records', () => {
    expect(listSource('museum', { kind: 'all' })).toBe('search')
    expect(listSource('museum', { kind: 'ios-unset' })).toBe('search')
    expect(listSource('1,1', { kind: 'all' })).toBe('search')
    expect(listSource('mu', { kind: 'all' })).toBe('inventory')
    expect(listSource('museum', { kind: 'tag', tag: 'featured' })).toBe('inventory')
  })

  it('filters hub records by title, world name or a covered parcel', () => {
    const row = toRow(genesis('3,3', ['3,3', '3,4'], 'Crypto Museum'), indexPlaces([]))
    expect(matchesText(row, 'museum')).toBe(true)
    expect(matchesText(row, '3,4')).toBe(true)
    expect(matchesText(row, '9,9')).toBe(false)
    expect(matchesText(toRow(world('boedo.dcl.eth', 'Counter-Strike'), indexPlaces([])), 'boedo')).toBe(true)
  })
})

describe('sortTagsForFilter', () => {
  it('puts the tags the apps read first, then the most used', () => {
    const counts = new Map([['friendzone', 49], ['curated', 11], ['featured', 9], ['allowed_ios', 226]])
    expect(sortTagsForFilter(['rod', 'curated', 'featured', 'friendzone', 'allowed_ios', 'ftue', 'banned_ios'], counts)).toEqual(
      ['allowed_ios', 'banned_ios', 'featured', 'ftue', 'friendzone', 'curated', 'rod']
    )
  })
})

describe('deepLink', () => {
  it('opens a Genesis City place by parcel and a world by realm', () => {
    const index = indexPlaces([])
    expect(deepLink(toRow(genesis('-3,-2'), index))).toBe('decentraland://open?position=-3,-2')
    expect(deepLink(toRow(world('boedo.dcl.eth'), index))).toBe('decentraland://open?realm=boedo.dcl.eth')
  })
})

describe('tagCounts', () => {
  it('counts tags within the chosen scope', () => {
    const places = [
      place({ id: 'a', tags: ['allowed_ios', 'featured'] }),
      place({ id: 'b', type: 'world', worldName: 'x.dcl.eth', tags: ['allowed_ios'] }),
    ]
    expect(tagCounts(places, 'all').get('allowed_ios')).toBe(2)
    expect(tagCounts(places, 'world').get('allowed_ios')).toBe(1)
    expect(tagCounts(places, 'world').get('featured')).toBeUndefined()
  })
})

describe('placeInputFor', () => {
  it('creates a Genesis City record with every parcel, so later lookups by any parcel find it', () => {
    const row = toRow(genesis('1,1', ['1,1', '1,2'], 'Plaza'), indexPlaces([]))
    expect(placeInputFor(row, ['allowed_ios'])).toEqual({
      type: 'scene',
      basePosition: '1,1',
      positions: ['1,1', '1,2'],
      name: 'Plaza',
      tags: ['allowed_ios'],
    })
  })

  it('creates a world record by world name', () => {
    const row = toRow(world('boedo.dcl.eth', 'Counter-Strike'), indexPlaces([]))
    expect(placeInputFor(row, ['banned_ios'])).toEqual({
      type: 'world',
      worldName: 'boedo.dcl.eth',
      name: 'Counter-Strike',
      tags: ['banned_ios'],
    })
  })
})

describe('placesSiteUrl', () => {
  it('links to the public Places page of the scene', () => {
    const index = indexPlaces([])
    expect(placesSiteUrl(toRow(genesis('-3,-2'), index), 'https://decentraland.org')).toBe(
      'https://decentraland.org/places/place/?position=-3%2C-2'
    )
    expect(placesSiteUrl(toRow(world('boedo.dcl.eth'), index), 'https://decentraland.org')).toBe(
      'https://decentraland.org/places/world/?name=boedo.dcl.eth'
    )
  })
})
