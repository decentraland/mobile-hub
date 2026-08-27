import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampaignsPage } from './CampaignsPage'
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  fetchCampaignAudit,
  type Campaign,
} from '../features/campaigns/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/campaigns/api', () => ({
  fetchCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  fetchCampaignAudit: vi.fn(),
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetchCampaigns = vi.mocked(fetchCampaigns)
const mockCreateCampaign = vi.mocked(createCampaign)
const mockUpdateCampaign = vi.mocked(updateCampaign)
const mockDeleteCampaign = vi.mocked(deleteCampaign)
const mockFetchAudit = vi.mocked(fetchCampaignAudit)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()

const SUMMER: Campaign = {
  token: 'summer-26',
  target: { type: 'genesis', position: '-9,-9' },
  startsAt: null,
  endsAt: null,
  enabled: true,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
}

function signedIn(isSignedIn: boolean) {
  mockUseAuth.mockReturnValue({ isSignedIn } as ReturnType<typeof useAuth>)
}

describe('CampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    mockFetchCampaigns.mockResolvedValue([SUMMER])
    mockFetchAudit.mockResolvedValue([])
    signedIn(true)
  })

  it('lists a campaign with its target and live state', async () => {
    render(<CampaignsPage />)

    expect(await screen.findByText('summer-26')).toBeTruthy()
    expect(screen.getByText('-9,-9')).toBeTruthy()
    expect(screen.getByText('LIVE')).toBeTruthy()
  })

  // A signed-out visitor must not be able to change what installs see.
  it('hides the editing affordances and does not call the backoffice when signed out', async () => {
    signedIn(false)

    render(<CampaignsPage />)

    expect(
      await screen.findByText('Sign in with an allowed wallet to manage campaigns.')
    ).toBeTruthy()
    expect(mockFetchCampaigns).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'New campaign' })).toBeNull()
  })

  it('validates the draft in the form before hitting the API', async () => {
    const user = userEvent.setup()
    render(<CampaignsPage />)
    await screen.findByText('summer-26')

    await user.click(screen.getByRole('button', { name: 'New campaign' }))
    await user.type(screen.getByLabelText('Campaign token'), 'Not A Token')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))

    expect(await screen.findByText(/must be kebab-case/)).toBeTruthy()
    expect(mockCreateCampaign).not.toHaveBeenCalled()
  })

  it('creates a campaign and puts it at the top of the list', async () => {
    const user = userEvent.setup()
    const created: Campaign = { ...SUMMER, token: 'world-launch', enabled: false }
    mockCreateCampaign.mockResolvedValue(created)

    render(<CampaignsPage />)
    await screen.findByText('summer-26')

    await user.click(screen.getByRole('button', { name: 'New campaign' }))
    await user.type(screen.getByLabelText('Campaign token'), 'world-launch')
    await user.type(screen.getByLabelText('Target parcel'), '10,20')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() =>
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        authenticatedFetch,
        expect.objectContaining({
          token: 'world-launch',
          targetType: 'genesis',
          targetPosition: '10,20',
          enabled: false,
        })
      )
    )
    expect(await screen.findByText('world-launch')).toBeTruthy()
  })

  // Toggling changes production behavior, so it goes through a confirmation.
  it('confirms before disabling a campaign', async () => {
    const user = userEvent.setup()
    mockUpdateCampaign.mockResolvedValue({ ...SUMMER, enabled: false })

    render(<CampaignsPage />)
    await screen.findByText('summer-26')

    await user.click(screen.getByRole('switch', { name: 'Toggle summer-26' }))
    expect(mockUpdateCampaign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() =>
      expect(mockUpdateCampaign).toHaveBeenCalledWith(authenticatedFetch, 'summer-26', {
        enabled: false,
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Toggle summer-26' }).getAttribute('aria-checked')
      ).toBe('false')
    )
  })

  it('confirms before deleting and drops the row', async () => {
    const user = userEvent.setup()
    mockDeleteCampaign.mockResolvedValue(undefined)

    render(<CampaignsPage />)
    await screen.findByText('summer-26')

    await user.click(screen.getByRole('button', { name: 'Delete summer-26' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(mockDeleteCampaign).toHaveBeenCalledWith(authenticatedFetch, 'summer-26')
    )
    await waitFor(() => expect(screen.queryByText('summer-26')).toBeNull())
  })

  it('keeps the dialog open and shows the server error when saving fails', async () => {
    const user = userEvent.setup()
    mockUpdateCampaign.mockRejectedValue(new Error('Forbidden: User not in allowed list'))

    render(<CampaignsPage />)
    await screen.findByText('summer-26')

    await user.click(screen.getByRole('switch', { name: 'Toggle summer-26' }))
    await user.click(screen.getByRole('button', { name: 'Yes, save' }))

    expect(await screen.findByText('Forbidden: User not in allowed list')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('loads the audit trail on demand', async () => {
    const user = userEvent.setup()
    mockFetchAudit.mockResolvedValue([
      {
        id: 1,
        token: 'summer-26',
        action: 'create',
        changes: { enabled: true },
        actor: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        createdAt: '2026-08-25T00:00:00.000Z',
      },
    ])

    render(<CampaignsPage />)
    await screen.findByText('summer-26')
    expect(mockFetchAudit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'History for summer-26' }))

    expect(await screen.findByText('create')).toBeTruthy()
    expect(mockFetchAudit).toHaveBeenCalledWith(authenticatedFetch, 'summer-26')
  })
})
