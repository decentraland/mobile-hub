import { describe, it, expect } from 'vitest'
import { draftToInput, emptyDraft } from './validation'

function genesisDraft(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return { ...emptyDraft(), token: 'summer2022', targetPosition: '-9,-9', ...overrides }
}

describe('draftToInput', () => {
  it('builds a genesis campaign', () => {
    const result = draftToInput(genesisDraft())

    expect(result).toEqual({
      input: {
        token: 'summer2022',
        targetType: 'genesis',
        targetPosition: '-9,-9',
      },
    })
  })

  it('builds a world campaign without a parcel', () => {
    const result = draftToInput(
      genesisDraft({ targetType: 'world', targetWorld: ' myworld.dcl.eth ' })
    )

    expect(result).toEqual({
      input: {
        token: 'summer2022',
        targetType: 'world',
        targetWorld: 'myworld.dcl.eth',
      },
    })
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
})
