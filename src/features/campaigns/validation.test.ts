import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { draftToInput, emptyDraft, toLocalDateTimeInput, windowState } from './validation'

function genesisDraft(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return { ...emptyDraft(), token: 'summer-26', targetPosition: '-9,-9', ...overrides }
}

describe('draftToInput', () => {
  it('builds a genesis campaign and nulls the empty optional fields', () => {
    const result = draftToInput(genesisDraft())

    expect(result).toEqual({
      input: {
        token: 'summer-26',
        targetType: 'genesis',
        targetPosition: '-9,-9',
        startsAt: null,
        endsAt: null,
        enabled: false,
      },
    })
  })

  it('builds a world campaign without a parcel', () => {
    const result = draftToInput(
      genesisDraft({ targetType: 'world', targetWorld: ' myworld.dcl.eth ' })
    )

    expect(result).toEqual({
      input: expect.objectContaining({
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

describe('date handling', () => {
  // Pinned off UTC on purpose: with the browser on UTC the old sliced-ISO implementation
  // round-trips by accident, so a UTC-only CI would never catch the drift regressing.
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  // A datetime-local input is read back as local wall time. Slicing the stored UTC string
  // into it showed the wrong moment and shifted the window by the browser's offset on every
  // save, compounding each time.
  it('round-trips a stored instant through the datetime-local input', () => {
    const stored = '2026-09-01T00:00:00.000Z'

    const shown = toLocalDateTimeInput(stored)

    expect(new Date(shown).toISOString()).toBe(stored)
    // The naive implementation this replaces; it is only equal when the browser is on UTC.
    expect(shown).not.toBe(stored.slice(0, 16))
  })

  it('treats an absent or unparseable bound as open-ended', () => {
    expect(toLocalDateTimeInput(null)).toBe('')
    expect(toLocalDateTimeInput('not-a-date')).toBe('')
  })

  // new Date(garbage).toISOString() throws rather than returning null, so an unguarded
  // parse escaped the form as an unhandled exception instead of an error message.
  it.each([
    ['start', { startsAt: 'not-a-date' }],
    ['end', { endsAt: 'not-a-date' }],
  ])('reports an invalid %s date instead of throwing', (_label, overrides) => {
    const result = draftToInput(genesisDraft(overrides))

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/not a valid date/)
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
