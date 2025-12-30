import { useCallback } from 'react'
import { useAuth } from '../contexts/auth'
import { createAuthenticatedFetch } from '../utils/fetch'

/**
 * Hook that provides an authenticated fetch function
 * Automatically uses signed requests when user is authenticated, falls back to regular fetch otherwise
 *
 * @returns An authenticated fetch function
 */
export const useAuthenticatedFetch = () => {
  const { wallet, isSignedIn } = useAuth()

  const authenticatedFetch = useCallback(
    (url: string, init?: RequestInit, additionalMetadata: Record<string, unknown> = {}) => {
      const fetchFn = createAuthenticatedFetch(wallet, isSignedIn)
      return fetchFn(url, init, additionalMetadata)
    },
    [wallet, isSignedIn]
  )

  return authenticatedFetch
}
