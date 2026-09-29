import { describe, it, expect } from 'vitest'
import { campaignDeepLink } from './deepLink'

describe('campaignDeepLink', () => {
  it('builds the link an ad group points at', () => {
    expect(campaignDeepLink('aesir-online')).toBe('decentraland://open?c=aesir-online')
  })

  it('encodes a token the form would have rejected', () => {
    expect(campaignDeepLink('summer 2026')).toBe('decentraland://open?c=summer%202026')
  })
})
