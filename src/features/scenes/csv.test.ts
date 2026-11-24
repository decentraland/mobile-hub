import { describe, it, expect } from 'vitest'
import { csvFilename, placesCsv } from './csv'
import type { SceneRow } from './model'

const ROW: SceneRow = {
  key: 'world:boedo.dcl.eth',
  kind: 'world',
  info: {
    key: 'world:boedo.dcl.eth',
    kind: 'world',
    title: 'Counter-Strike "1.6"',
    description: 'Shoot,\nreload',
    thumbnail: null,
    basePosition: null,
    positions: [],
    worldName: 'boedo.dcl.eth',
    owner: 'Boedo',
    userCount: 0,
  },
  place: null,
}

describe('placesCsv', () => {
  it('keeps the Curation export columns and quotes values that need it', () => {
    expect(placesCsv([ROW]).split('\n').slice(0, 1)).toEqual(['Title,Description,Owner,Contact,Deeplink,Type,Tags'])
    expect(placesCsv([ROW])).toContain(
      '"Counter-Strike ""1.6""","Shoot,\nreload",Boedo,,decentraland://open?realm=boedo.dcl.eth,world,'
    )
  })
})

describe('csvFilename', () => {
  it('names the file after the filter and the day', () => {
    const day = new Date('2026-11-23T10:00:00Z')
    expect(csvFilename({ kind: 'tag', tag: 'allowed_ios' }, day)).toBe('allowed_ios_places_2026-11-23.csv')
    expect(csvFilename({ kind: 'ios-unset' }, day)).toBe('no_ios_status_places_2026-11-23.csv')
    expect(csvFilename({ kind: 'all' }, day)).toBe('all_places_2026-11-23.csv')
  })
})
