import { useCallback, useEffect, useState, type FC, type ReactNode } from 'react'
import { useAuth } from '../../contexts/auth'
import { useAuthenticatedFetch } from '../../hooks/useAuthenticatedFetch'
import { isDevMode } from '../../utils/devIdentity'
import { fetchBackofficeAccess } from './api'
import { SignInScreen } from './SignInScreen'
import { NoAccessModal } from './NoAccessModal'
import './AccessGate.css'

type ProbeResult =
  | { status: 'allowed' }
  | { status: 'denied'; address: string }
  | { status: 'error'; message: string }

/**
 * Single gate for the whole admin UI.
 *
 * Nothing renders until the wallet is both signed in and on the BFF's allow list,
 * so individual pages never have to ask "may I write?" — if they are mounted, the
 * answer is yes. Must sit inside AuthProvider (it calls useAuth) and outside the
 * data providers, so their backoffice fetches never fire for an unauthorized wallet.
 *
 * On localhost the gate is bypassed entirely: requests are signed there with the
 * hardcoded dev identity, which never goes through the sign-in redirect.
 */
export const AccessGate: FC<{ children: ReactNode }> = ({ children }) => {
  const { wallet, isSignedIn, isConnecting, signIn, signOut } = useAuth()
  const authenticatedFetch = useAuthenticatedFetch()
  const [attempt, setAttempt] = useState(0)
  // Tagged with the attempt it answers, so a stale result is never read as the
  // current one — no reset-on-change setState needed.
  const [probe, setProbe] = useState<{ key: string; result: ProbeResult } | null>(null)

  const devMode = isDevMode()
  const key = `${wallet ?? ''}:${attempt}`
  const resolved = probe?.key === key ? probe.result : null

  useEffect(() => {
    if (devMode || !isSignedIn || !wallet) return

    let cancelled = false

    fetchBackofficeAccess(authenticatedFetch)
      .then(({ address, allowed }) => {
        if (cancelled) return
        setProbe({ key, result: allowed ? { status: 'allowed' } : { status: 'denied', address } })
      })
      .catch((error: Error) => {
        if (cancelled) return
        setProbe({ key, result: { status: 'error', message: error.message } })
      })

    return () => {
      cancelled = true
    }
  }, [devMode, isSignedIn, wallet, authenticatedFetch, key])

  const retry = useCallback(() => setAttempt(count => count + 1), [])

  if (devMode) {
    return <>{children}</>
  }

  if (isConnecting) {
    return <AccessMessage text="Connecting…" />
  }

  if (!isSignedIn || !wallet) {
    return <SignInScreen onSignIn={signIn} />
  }

  if (resolved?.status === 'denied') {
    return (
      <>
        <SignInScreen onSignIn={signIn} />
        <NoAccessModal address={resolved.address} onClose={signOut} />
      </>
    )
  }

  if (resolved?.status === 'error') {
    return (
      <div className="access-screen">
        <div className="access-card">
          <h1>Could not verify your permissions</h1>
          <p className="access-error-detail">{resolved.message}</p>
          <div className="access-card-actions">
            <button className="access-button-secondary" onClick={signOut}>
              Sign out
            </button>
            <button className="access-button-primary" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (resolved?.status !== 'allowed') {
    return <AccessMessage text="Checking permissions…" />
  }

  return <>{children}</>
}

const AccessMessage: FC<{ text: string }> = ({ text }) => (
  <div className="access-screen">
    <div className="access-card">
      <p>{text}</p>
    </div>
  </div>
)
