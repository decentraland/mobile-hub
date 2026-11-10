import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatorFundPage } from './CreatorFundPage'
import * as api from '../features/creator-fund/api'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

vi.mock('../features/creator-fund/api')
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))

const authenticatedFetch = vi.fn()

const RUNNING: api.Cycle = {
  id: 2,
  start_at: '2026-11-01T00:00:00.000Z',
  end_at: '2026-11-15T00:00:00.000Z',
  pool_usdc: 10000,
  status: 'running',
}

const ADA: api.AdminCreator = {
  address: '0x1ea71fa41e7fe758c147eaaaf6a1b3cb0200acec',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  email_verified_at: null,
  status: 'active',
  enrolled_at: '2026-11-02T10:00:00.000Z',
  terms_version: 1,
}

describe('CreatorFundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthenticatedFetch).mockReturnValue(authenticatedFetch)
    vi.mocked(api.getCycles).mockResolvedValue([RUNNING])
    vi.mocked(api.getTerms).mockResolvedValue({ version: 1, title: 'Beta terms', published_at: RUNNING.start_at, content: '# Terms' })
    vi.mocked(api.getNews).mockResolvedValue([])
    vi.mocked(api.getCreators).mockResolvedValue([ADA])
    vi.mocked(api.getExclusions).mockResolvedValue({ places: [], creators: [] })
    vi.mocked(api.getCyclePlaces).mockResolvedValue([])
  })

  it('shows the cycles, the current terms and the enrolled creators the service answers', async () => {
    render(<CreatorFundPage />)

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    expect(screen.getByText(/Beta terms/)).toBeTruthy()
    expect(api.getCreators).toHaveBeenCalledWith(authenticatedFetch)
  })

  it('suspends a creator only after the confirm dialog, then reloads', async () => {
    vi.mocked(api.setCreatorStatus).mockResolvedValue({ ...ADA, status: 'suspended' })
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: `Suspend ${ADA.address}` }))
    expect(api.setCreatorStatus).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Suspend creator' })
    expect(within(dialog).getByText('suspended')).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(api.setCreatorStatus).toHaveBeenCalledWith(authenticatedFetch, ADA.address, 'suspended'))
    await waitFor(() => expect(api.getCreators).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Creator suspended')
  })

  it('deletes a closed cycle only after a dialog that warns its payout record goes with it', async () => {
    const closed: api.Cycle = { ...RUNNING, id: 1, start_at: '2026-10-01T00:00:00.000Z', end_at: '2026-10-15T00:00:00.000Z', status: 'closed' }
    vi.mocked(api.getCycles).mockResolvedValue([closed, RUNNING])
    vi.mocked(api.deleteCycle).mockResolvedValue(undefined)
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete cycle 1' }))
    expect(api.deleteCycle).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Delete cycle 1' })
    expect(within(dialog).getByText(/This cycle is closed/)).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete cycle' }))

    await waitFor(() => expect(api.deleteCycle).toHaveBeenCalledWith(authenticatedFetch, 1))
    await waitFor(() => expect(api.getCycles).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status').textContent).toBe('Cycle 1 deleted')
  })

  it('does nothing when the dialog is cancelled', async () => {
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: `Suspend ${ADA.address}` }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.setCreatorStatus).not.toHaveBeenCalled()
  })

  it('keeps the dialog open with the service message when the write is refused', async () => {
    vi.mocked(api.setCreatorStatus).mockRejectedValue(new Error('0x… is not enrolled'))
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: `Suspend ${ADA.address}` }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }))

    expect(await within(screen.getByRole('dialog')).findByText('0x… is not enrolled')).toBeTruthy()
  })

  it('publishes the next terms version and warns that creators must re-accept', async () => {
    vi.mocked(api.publishTerms).mockResolvedValue({ version: 2, title: 'v2', published_at: RUNNING.start_at, content: 'x' })
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Publish version 2' }))

    // The editor starts from the current version, so the fields are cleared before typing.
    const title = screen.getByLabelText('Terms title')
    expect(title).toHaveProperty('value', 'Beta terms')
    await userEvent.clear(title)
    await userEvent.type(title, 'v2')
    const content = screen.getByLabelText('Terms content')
    await userEvent.clear(content)
    await userEvent.type(content, 'New text')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    const dialog = screen.getByRole('dialog', { name: 'Publish terms version 2' })
    expect(within(dialog).getByText(/terms outdated/)).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() =>
      expect(api.publishTerms).toHaveBeenCalledWith(authenticatedFetch, 2, { title: 'v2', content: 'New text' })
    )
  })

  it('refuses to review a cycle whose end is not after its start, and sends nothing', async () => {
    render(<CreatorFundPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'New cycle' }))
    await userEvent.type(screen.getByLabelText('Cycle start'), '2026-12-01T00:00')
    await userEvent.type(screen.getByLabelText('Cycle end'), '2026-12-01T00:00')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByText('Must be after the start')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Create cycle 3' })).toBeNull()
    expect(api.putCycle).not.toHaveBeenCalled()
  })

  it('shows the load error with a Retry that refetches', async () => {
    vi.mocked(api.getCreators).mockRejectedValueOnce(new Error('Forbidden'))
    render(<CreatorFundPage />)

    await screen.findByText('Forbidden')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
  })
})
