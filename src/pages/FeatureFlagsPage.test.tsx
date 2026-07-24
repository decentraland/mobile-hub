import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeatureFlagsPage } from './FeatureFlagsPage'
import {
  fetchFeatureFlags,
  fetchFeatureFlagsDetailed,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  type FeatureFlag,
} from '../features/flags/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/flags/api', () => ({
  fetchFeatureFlags: vi.fn(),
  fetchFeatureFlagsDetailed: vi.fn(),
  createFeatureFlag: vi.fn(),
  updateFeatureFlag: vi.fn(),
  deleteFeatureFlag: vi.fn(),
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetchFlags = vi.mocked(fetchFeatureFlags)
const mockFetchDetailed = vi.mocked(fetchFeatureFlagsDetailed)
const mockCreateFlag = vi.mocked(createFeatureFlag)
const mockUpdateFlag = vi.mocked(updateFeatureFlag)
const mockDeleteFlag = vi.mocked(deleteFeatureFlag)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()

const PULSE: FeatureFlag = {
  name: 'pulse',
  enabled: false,
  description: 'Pulse avatar transport',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: null,
}

const DUAL_CHANNEL: FeatureFlag = {
  name: 'dual-channel',
  enabled: true,
  description: 'LiveKit movement dual-send',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
}

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<typeof useAuth>)
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    mockFetchDetailed.mockResolvedValue([DUAL_CHANNEL, PULSE])
    mockFetchFlags.mockResolvedValue({ pulse: false, 'dual-channel': true })
  })

  it('loads detailed flags for editors and renders state and descriptions', async () => {
    render(<FeatureFlagsPage />)

    const pulseSwitch = await screen.findByRole('switch', { name: 'Toggle pulse' })

    expect(mockFetchDetailed).toHaveBeenCalledWith(authenticatedFetch)
    expect(mockFetchFlags).not.toHaveBeenCalled()
    expect(pulseSwitch.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Toggle dual-channel' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Pulse avatar transport')).toBeTruthy()
    expect(screen.getByText('LiveKit movement dual-send')).toBeTruthy()
  })

  it('falls back to the public endpoint and disables editing for read-only viewers', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)
    mockIsDevMode.mockReturnValue(false)

    render(<FeatureFlagsPage />)

    const pulseSwitch = await screen.findByRole('switch', { name: 'Toggle pulse' })

    expect(mockFetchFlags).toHaveBeenCalled()
    expect(mockFetchDetailed).not.toHaveBeenCalled()
    expect(pulseSwitch).toHaveProperty('disabled', true)
    expect(screen.getByText(/sign in with an allowed wallet/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New flag' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit pulse description' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete pulse' })).toBeNull()
  })

  it('shows the load error with a Retry button that refetches', async () => {
    mockFetchDetailed.mockRejectedValueOnce(new Error('network down'))

    render(<FeatureFlagsPage />)

    await screen.findByText('network down')

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByRole('switch', { name: 'Toggle pulse' })
    expect(mockFetchDetailed).toHaveBeenCalledTimes(2)
  })

  it('opens a confirm dialog when toggling and does nothing on cancel', async () => {
    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('pulse')
    expect(dialog.textContent).toContain('OFF')
    expect(dialog.textContent).toContain('ON')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpdateFlag).not.toHaveBeenCalled()
  })

  it('saves a toggle on confirm and re-renders from the returned flag', async () => {
    mockUpdateFlag.mockResolvedValue({ ...PULSE, enabled: true })

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpdateFlag).toHaveBeenCalledWith(authenticatedFetch, 'pulse', { enabled: true })
    expect(screen.getByRole('switch', { name: 'Toggle pulse' }).getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the dialog open and shows the error message when the save fails', async () => {
    mockUpdateFlag.mockRejectedValue(new Error('Forbidden: User not in allowed list'))

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('switch', { name: 'Toggle pulse' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await screen.findByText('Forbidden: User not in allowed list')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Toggle pulse' }).getAttribute('aria-checked')).toBe('false')
  })

  it('edits a description inline and saves it', async () => {
    mockUpdateFlag.mockResolvedValue({ ...PULSE, description: 'New words' })

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit pulse description' }))

    const textarea = screen.getByRole('textbox', { name: 'Description for pulse' })
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'New words')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('New words')
    expect(mockUpdateFlag).toHaveBeenCalledWith(authenticatedFetch, 'pulse', { description: 'New words' })
    expect(screen.queryByRole('textbox', { name: 'Description for pulse' })).toBeNull()
  })

  it('creates a new flag from the form', async () => {
    const created: FeatureFlag = {
      name: 'shiny-thing',
      enabled: false,
      description: 'A new toggle',
      updatedAt: '2026-07-23T01:00:00.000Z',
      updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }
    mockCreateFlag.mockResolvedValue(created)

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'New flag' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Flag name' }), 'shiny-thing')
    await userEvent.type(screen.getByRole('textbox', { name: 'Flag description' }), 'A new toggle')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    await screen.findByRole('switch', { name: 'Toggle shiny-thing' })
    expect(mockCreateFlag).toHaveBeenCalledWith(authenticatedFetch, {
      name: 'shiny-thing',
      enabled: false,
      description: 'A new toggle',
    })
  })

  it('rejects an invalid flag name client-side without calling the API', async () => {
    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'New flag' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Flag name' }), 'Not Valid')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    await screen.findByText(/kebab-case/i)
    expect(mockCreateFlag).not.toHaveBeenCalled()
  })

  it('shows the server error when creating a duplicate flag', async () => {
    mockCreateFlag.mockRejectedValue(new Error("Feature flag 'pulse' already exists"))

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'New flag' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Flag name' }), 'pulse')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    await screen.findByText("Feature flag 'pulse' already exists")
  })

  it('deletes a flag after confirmation', async () => {
    mockDeleteFlag.mockResolvedValue(undefined)

    render(<FeatureFlagsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete pulse' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('pulse')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: 'Toggle pulse' })).toBeNull()
    )
    expect(mockDeleteFlag).toHaveBeenCalledWith(authenticatedFetch, 'pulse')
    expect(screen.getByRole('switch', { name: 'Toggle dual-channel' })).toBeTruthy()
  })
})
