import { describe, it, expect } from 'vitest'
import { draftToInput, emptyDraft, parsePlaceIds, windowState } from './validation'

const UUID = '780f04dd-eba1-41a8-b109-74896c87e98b'
const OTHER_UUID = '11111111-2222-3333-4444-555555555555'

function genesisDraft(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return { ...emptyDraft(), token: 'summer-26', targetPosition: '-9,-9', ...overrides }
}

describe('draftToInput', () => {
  it('builds a genesis campaign and nulls the empty optional fields', () => {
    const result = draftToInput(genesisDraft())

    expect(result).toEqual({
      input: {
        token: 'summer-26',
        mode: 'ftue',
        targetType: 'genesis',
        targetPosition: '-9,-9',
        title: null,
        cta: null,
        placeIds: [],
        startsAt: null,
        endsAt: null,
        enabled: false,
      },
    })
  })

  it('builds a world campaign without a parcel', () => {
    const result = draftToInput(
      genesisDraft({ targetType: 'world', targetWorld: ' myworld.dcl.eth ', mode: 'bypass' })
    )

    expect(result).toEqual({
      input: expect.objectContaining({
        mode: 'bypass',
        targetType: 'world',
        targetWorld: 'myworld.dcl.eth',
      }),
    })
    expect(result).not.toHaveProperty('input.targetPosition')
  })

  it.each([
    ['a non-kebab token', { token: 'Summer 26' }],
    ['an empty token', { token: '' }],
    ['an over-long token', { token: 'a'.repeat(65) }],
    ['a malformed parcel', { targetPosition: '9' }],
    ['an over-long title', { title: 'a'.repeat(121) }],
    ['an over-long cta', { cta: 'a'.repeat(41) }],
    ['a non-uuid place id', { placeIds: 'not-a-uuid' }],
    ['repeated place ids', { placeIds: `${UUID}, ${UUID}` }],
    ['too many place ids', { placeIds: new Array(11).fill(UUID).join(',') }],
  ])('rejects %s', (_label, overrides) => {
    expect(draftToInput(genesisDraft(overrides))).toHaveProperty('error')
  })

  // The client only routes worlds whose name matches Realm.is_dcl_ens; anything else would
  // be treated as a realm URL and never reach the intended world.
  it.each(['myworld', 'myworld.eth', 'my-world.dcl.eth', 'sub.myworld.dcl.eth', ''])(
    'rejects the unroutable world name %s',
    targetWorld => {
      expect(
        draftToInput(genesisDraft({ targetType: 'world', targetWorld }))
      ).toHaveProperty('error')
    }
  )

  it('requires the end of the window to be after its start', () => {
    const inverted = genesisDraft({ startsAt: '2026-09-30T00:00', endsAt: '2026-09-01T00:00' })
    expect(draftToInput(inverted)).toHaveProperty('error')

    const ordered = genesisDraft({ startsAt: '2026-09-01T00:00', endsAt: '2026-09-30T00:00' })
    expect(ordered && draftToInput(ordered)).toHaveProperty('input')
  })

  it('leaves an open-ended window as nulls', () => {
    const result = draftToInput(genesisDraft({ endsAt: '2026-09-30T00:00' }))

    expect(result).toEqual({
      input: expect.objectContaining({ startsAt: null, endsAt: expect.any(String) }),
    })
  })
})

describe('parsePlaceIds', () => {
  it('accepts commas, spaces and newlines and drops the blanks', () => {
    expect(parsePlaceIds(` ${UUID},\n ${OTHER_UUID} ,, `)).toEqual([UUID, OTHER_UUID])
    expect(parsePlaceIds('   ')).toEqual([])
  })
})

describe('windowState', () => {
  const now = new Date('2026-09-15T00:00:00.000Z')

  it.each([
    ['disabled', { enabled: false, startsAt: null, endsAt: null }, 'disabled'],
    ['open-ended and on', { enabled: true, startsAt: null, endsAt: null }, 'live'],
    ['inside the window', { enabled: true, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z' }, 'live'],
    ['before the window', { enabled: true, startsAt: '2026-10-01T00:00:00.000Z', endsAt: null }, 'scheduled'],
    ['after the window', { enabled: true, startsAt: null, endsAt: '2026-09-01T00:00:00.000Z' }, 'expired'],
  ])('reports %s', (_label, campaign, expected) => {
    expect(windowState(campaign, now)).toBe(expected)
  })

  // Disabled wins over the window: the BFF will not serve it either way.
  it('reports disabled even inside an active window', () => {
    expect(
      windowState({ enabled: false, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z' }, now)
    ).toBe('disabled')
  })
})
