import { describe, it, expect } from 'vitest'
import { creatorsToCsv } from './csv'
import type { AdminCreator } from './api'

const CREATOR: AdminCreator = {
  address: '0x1ea71fa41e7fe758c147eaaaf6a1b3cb0200acec',
  first_name: '=HYPERLINK("https://evil.example","Ada")',
  last_name: 'O"Hara',
  email: '+ada@example.com',
  email_verified_at: null,
  status: 'active',
  enrolled_at: '2026-11-02T10:00:00.000Z',
  terms_version: 1,
}

describe('creatorsToCsv', () => {
  it('neutralises formula-looking cells and escapes quotes, since creators type their own names', () => {
    const [header, row] = creatorsToCsv([CREATOR]).split('\n')

    expect(header).toBe('address,first_name,last_name,email,email_verified_at,status,enrolled_at,terms_version')
    expect(row).toBe(
      `"0x1ea71fa41e7fe758c147eaaaf6a1b3cb0200acec","'=HYPERLINK(""https://evil.example"",""Ada"")","O""Hara","'+ada@example.com","","active","2026-11-02T10:00:00.000Z","1"`
    )
  })
})
