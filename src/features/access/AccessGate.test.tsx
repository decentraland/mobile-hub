import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessGate } from './AccessGate'
import { fetchBackofficeAccess } from './api'
import { useAuth } from '../../contexts/auth'
import { useAuthenticatedFetch } from '../../hooks/useAuthenticatedFetch'
import { isDevMode } from '../../utils/devIdentity'

vi.mock('./api', () => ({ fetchBackofficeAccess: vi.fn() }))
vi.mock('../../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetchAccess = vi.mocked(fetchBackofficeAccess)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()
const signIn = vi.fn()
const signOut = vi.fn()

const WALLET = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

function auth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockUseAuth.mockReturnValue({
    wallet: undefined,
    isSignedIn: false,
    isConnecting: false,
    signIn,
    signOut,
    ...overrides,
  } as ReturnType<typeof useAuth>)
}

function renderGate() {
  return render(
    <AccessGate>
      <div>admin panels</div>
    </AccessGate>
  )
}

describe('AccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    auth()
  })

  // The whole point of the gate: a visitor with no session sees nothing but the door.
  it('shows only the sign-in screen when signed out, and never touches the backoffice', async () => {
    renderGate()

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy()
    expect(screen.queryByText('admin panels')).toBeNull()
    expect(mockFetchAccess).not.toHaveBeenCalled()
  })

  it('starts the sign-in redirect when the button is clicked', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(signIn).toHaveBeenCalled()
  })

  it('holds the UI back while the wallet connection is being restored', () => {
    auth({ isConnecting: true })

    renderGate()

    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect(screen.queryByText('admin panels')).toBeNull()
  })

  it('shows a checking state while the permission probe is in flight', () => {
    auth({ isSignedIn: true, wallet: WALLET })
    mockFetchAccess.mockReturnValue(new Promise(() => {}))

    renderGate()

    expect(screen.getByText('Checking permissions…')).toBeTruthy()
    expect(screen.queryByText('admin panels')).toBeNull()
  })

  it('renders the app once the wallet is on the allow list', async () => {
    auth({ isSignedIn: true, wallet: WALLET })
    mockFetchAccess.mockResolvedValue({ address: WALLET, allowed: true })

    renderGate()

    expect(await screen.findByText('admin panels')).toBeTruthy()
    expect(mockFetchAccess).toHaveBeenCalledWith(authenticatedFetch)
  })

  // A wallet without privileges must never see the panels, and its session is closed.
  it('shows the no-permissions modal instead of the app and signs out when it is closed', async () => {
    const user = userEvent.setup()
    auth({ isSignedIn: true, wallet: WALLET })
    mockFetchAccess.mockResolvedValue({ address: WALLET, allowed: false })

    renderGate()

    const dialog = await screen.findByRole('dialog')

    expect(screen.queryByText('admin panels')).toBeNull()
    expect(dialog.textContent).toContain('0xf39f…2266')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
  })

  it('shows an error with a Retry that re-runs the probe when the check itself fails', async () => {
    const user = userEvent.setup()
    auth({ isSignedIn: true, wallet: WALLET })
    mockFetchAccess.mockRejectedValueOnce(new Error('Failed to fetch'))

    renderGate()

    expect(await screen.findByText('Failed to fetch')).toBeTruthy()
    expect(screen.queryByText('admin panels')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    mockFetchAccess.mockResolvedValue({ address: WALLET, allowed: true })
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('admin panels')).toBeTruthy()
  })

  // On localhost requests are signed with the hardcoded dev identity, which never
  // goes through the sign-in redirect, so the gate steps aside entirely.
  it('renders the app without probing in dev mode', async () => {
    mockIsDevMode.mockReturnValue(true)

    renderGate()

    expect(screen.getByText('admin panels')).toBeTruthy()
    await waitFor(() => expect(mockFetchAccess).not.toHaveBeenCalled())
  })
})
