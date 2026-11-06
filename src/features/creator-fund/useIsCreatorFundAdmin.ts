import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/auth'
import { useAuthenticatedFetch } from '../../hooks/useAuthenticatedFetch'
import { isDevMode } from '../../utils/devIdentity'
import { isAdmin } from './api'

/**
 * Whether the signed-in wallet may open the Creator Fund backoffice. Asked of the service on every
 * wallet change and never cached: the tab is hidden for everyone else, and the service is what
 * decides, so nothing here can be scraped for more than a 403.
 */
export function useIsCreatorFundAdmin(): boolean {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    const allowed = isSignedIn || isDevMode() ? isAdmin(authenticatedFetch).catch(() => false) : Promise.resolve(false)
    allowed.then(value => {
      if (!cancelled) setAdmin(value)
    })
    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, isSignedIn])

  return admin
}
