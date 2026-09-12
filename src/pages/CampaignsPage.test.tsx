import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampaignsPage } from './CampaignsPage'
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type Campaign,
} from '../features/campaigns/api'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

vi.mock('../features/campaigns/api', () => ({
  fetchCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))

const mockFetchCampaigns = vi.mocked(fetchCampaigns)
const mockCreateCampaign = vi.mocked(createCampaign)
const mockUpdateCampaign = vi.mocked(updateCampaign)
const mockDeleteCampaign = vi.mocked(deleteCampaign)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)

const authenticatedFetch = vi.fn()

const SUMMER: Campaign = {
  token: 'summer2022',
  target: { type: 'genesis', position: '-9,-9' },
}

describe('CampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockFetchCampaigns.mockResolvedValue([SUMMER])
  })

  it('lists a campaign with its target', async () => {
    render(<CampaignsPage />)

    expect(await screen.findByText('summer2022')).toBeTruthy()
    expect(screen.getByText('-9,-9')).toBeTruthy()
  })

  it('validates the draft in the form before hitting the API', async () => {
    const user = userEvent.setup()
    render(<CampaignsPage />)
    await screen.findByText('summer2022')

    await user.click(screen.getByRole('button', { name: 'New campaign' }))
    await user.type(screen.getByLabelText('Campaign token'), 'Not A Token')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))

    expect(await screen.findByText(/must be kebab-case/)).toBeTruthy()
    expect(mockCreateCampaign).not.toHaveBeenCalled()
  })

  it('creates a campaign and puts it at the top of the list', async () => {
    const user = userEvent.setup()
    mockCreateCampaign.mockResolvedValue({
      token: 'world-launch',
      target: { type: 'genesis', position: '10,20' },
    })

    render(<CampaignsPage />)
    await screen.findByText('summer2022')

    await user.click(screen.getByRole('button', { name: 'New campaign' }))
    await user.type(screen.getByLabelText('Campaign token'), 'world-launch')
    await user.type(screen.getByLabelText('Target parcel'), '10,20')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() =>
      expect(mockCreateCampaign).toHaveBeenCalledWith(authenticatedFetch, {
        token: 'world-launch',
        targetType: 'genesis',
        targetPosition: '10,20',
      })
    )
    expect(await screen.findByText('world-launch')).toBeTruthy()
  })

  // The BFF constrains the three target columns as a unit, so an edit sends the whole target.
  it('sends the whole target when the campaign is edited', async () => {
    const user = userEvent.setup()
    mockUpdateCampaign.mockResolvedValue({
      token: 'summer2022',
      target: { type: 'world', name: 'myworld.dcl.eth' },
    })

    render(<CampaignsPage />)
    await screen.findByText('summer2022')

    await user.click(screen.getByRole('button', { name: 'Edit summer2022' }))
    await user.selectOptions(screen.getByLabelText('Target type'), 'world')
    await user.type(screen.getByLabelText('Target world'), 'myworld.dcl.eth')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdateCampaign).toHaveBeenCalledWith(authenticatedFetch, 'summer2022', {
        targetType: 'world',
        targetPosition: undefined,
        targetWorld: 'myworld.dcl.eth',
      })
    )
    expect(await screen.findByText('myworld.dcl.eth')).toBeTruthy()
  })

  // Deleting changes what installs see, so it goes through a confirmation.
  it('confirms before deleting and drops the row', async () => {
    const user = userEvent.setup()
    mockDeleteCampaign.mockResolvedValue(undefined)

    render(<CampaignsPage />)
    await screen.findByText('summer2022')

    await user.click(screen.getByRole('button', { name: 'Delete summer2022' }))
    expect(mockDeleteCampaign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(mockDeleteCampaign).toHaveBeenCalledWith(authenticatedFetch, 'summer2022')
    )
    await waitFor(() => expect(screen.queryByText('summer2022')).toBeNull())
  })

  it('keeps the dialog open and shows the server error when deleting fails', async () => {
    const user = userEvent.setup()
    mockDeleteCampaign.mockRejectedValue(new Error('Forbidden: User not in allowed list'))

    render(<CampaignsPage />)
    await screen.findByText('summer2022')

    await user.click(screen.getByRole('button', { name: 'Delete summer2022' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText('Forbidden: User not in allowed list')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
