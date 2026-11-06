import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useIsCreatorFundAdmin } from './useIsCreatorFundAdmin'

// The dev hub's config: no Creator Fund URL at all.
vi.mock('../../config', () => ({ config: { get: () => '' } }))
vi.mock('../../contexts/auth', () => ({ useAuth: () => ({ isSignedIn: true }) }))
vi.mock('../../utils/devIdentity', () => ({ isDevMode: () => false }))
const authenticatedFetch = vi.fn()
vi.mock('../../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: () => authenticatedFetch }))

describe('useIsCreatorFundAdmin, with no Creator Fund URL configured', () => {
  it('hides the tab without asking any service', async () => {
    const { result } = renderHook(() => useIsCreatorFundAdmin())

    await waitFor(() => expect(result.current).toBe(false))
    expect(authenticatedFetch).not.toHaveBeenCalled()
  })
})
