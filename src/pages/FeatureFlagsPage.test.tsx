import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeatureFlagsPage } from './FeatureFlagsPage'
import { fetchFeatureFlags, updateFeatureFlags } from '../features/flags/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/flags/api', () => ({
  fetchFeatureFlags: vi.fn(),
  updateFeatureFlags: vi.fn(),
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetchFlags = vi.mocked(fetchFeatureFlags)
const mockUpdateFlags = vi.mocked(updateFeatureFlags)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<typeof useAuth>)
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    mockFetchFlags.mockResolvedValue({ pulse: false, 'dual-channel': true })
  })

  it('loads the flags on mount and renders a toggle per flag with its state', async () => {
    render(<FeatureFlagsPage />)

    const pulseSwitch = await screen.findByRole('switch', { name: 'Toggle pulse' })
    const dualChannelSwitch = screen.getByRole('switch', { name: 'Toggle dual-channel' })

    expect(pulseSwitch).toHaveProperty('disabled', false)
    expect(pulseSwitch.getAttribute('aria-checked')).toBe('false')
    expect(dualChannelSwitch.getAttribute('aria-checked')).toBe('true')
    expect(mockFetchFlags).toHaveBeenCalledTimes(1)
  })

  it('shows the load error with a Retry button that refetches', async () => {
    mockFetchFlags.mockRejectedValueOnce(new Error('network down'))

    render(<FeatureFlagsPage />)

    await screen.findByText('network down')
    expect(screen.queryByRole('switch', { name: 'Toggle pulse' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByRole('switch', { name: 'Toggle pulse' })
    expect(mockFetchFlags).toHaveBeenCalledTimes(2)
  })

  it('disables the toggles and shows a warning when the user cannot edit', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)
    mockIsDevMode.mockReturnValue(false)

    render(<FeatureFlagsPage />)

    const pulseSwitch = await screen.findByRole('switch', { name: 'Toggle pulse' })
    expect(pulseSwitch).toHaveProperty('disabled', true)
    expect(screen.getByText(/sign in with an allowed wallet/i)).toBeTruthy()
  })

  it('allows editing in dev mode even when signed out', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)
    mockIsDevMode.mockReturnValue(true)

    render(<FeatureFlagsPage />)

    const pulseSwitch = await screen.findByRole('switch', { name: 'Toggle pulse' })
    expect(pulseSwitch).toHaveProperty('disabled', false)
  })

  it('opens a confirm dialog showing the OFF → ON transition when a toggle is clicked', async () => {
    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('pulse')
    expect(dialog.textContent).toContain('OFF')
    expect(dialog.textContent).toContain('ON')
    expect(mockUpdateFlags).not.toHaveBeenCalled()
  })

  it('closes the dialog without saving when Cancel is clicked', async () => {
    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpdateFlags).not.toHaveBeenCalled()
  })

  it('saves the single-flag change on confirm and re-renders from the returned map', async () => {
    mockUpdateFlags.mockResolvedValue({ pulse: true, 'dual-channel': true })

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpdateFlags).toHaveBeenCalledWith(authenticatedFetch, { pulse: true })

    const pulseSwitch = screen.getByRole('switch', { name: 'Toggle pulse' })
    expect(pulseSwitch.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the dialog open and shows the error message when the save fails', async () => {
    mockUpdateFlags.mockRejectedValue(new Error('Forbidden: User not in allowed list'))

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await screen.findByText('Forbidden: User not in allowed list')
    expect(screen.getByRole('dialog')).toBeTruthy()

    const pulseSwitch = screen.getByRole('switch', { name: 'Toggle pulse' })
    expect(pulseSwitch.getAttribute('aria-checked')).toBe('false')
  })
})
