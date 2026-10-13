import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushPage } from './PushPage'
import {
  fetchPushCampaigns,
  createPushCampaign,
  approvePushCampaign,
  uploadPushAudience,
  fetchPushCampaignStats,
  syncPushFeed,
  fetchDailySends,
  type PushCampaign,
} from '../features/push/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/push/api', () => ({
  fetchPushCampaigns: vi.fn(),
  createPushCampaign: vi.fn(),
  updatePushCampaign: vi.fn(),
  uploadPushAudience: vi.fn(),
  testSendPushCampaign: vi.fn(),
  submitPushCampaign: vi.fn(),
  approvePushCampaign: vi.fn(),
  cancelPushCampaign: vi.fn(),
  fetchPushCampaignStats: vi.fn(),
  syncPushFeed: vi.fn(),
  fetchDailySends: vi.fn(),
  FEED_TRIGGER_KEYS: ['d1', 'd3', 'd7', 'd15', 'd30'],
  FEED_DESTINATION_KINDS: ['scene', 'plaza', 'discover'],
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetch = vi.mocked(fetchPushCampaigns)
const mockCreate = vi.mocked(createPushCampaign)
const mockApprove = vi.mocked(approvePushCampaign)
const mockSync = vi.mocked(syncPushFeed)
const mockDaily = vi.mocked(fetchDailySends)
const mockUploadAudience = vi.mocked(uploadPushAudience)
const mockStats = vi.mocked(fetchPushCampaignStats)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const CREATOR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APPROVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

const PENDING: PushCampaign = {
  id: '11111111-1111-1111-1111-111111111111',
  campaignKey: 'spring-event',
  title: 'Come back',
  body: 'Something is happening',
  deepLink: 'decentraland://open?position=0,0',
  imageUrl: null,
  category: 'liveops',
  status: 'pending_approval',
  ttlSeconds: 86400,
  scheduledAt: null,
  isRecurring: false,
  triggerKey: null,
  destinationKind: null,
  audienceCount: 1200,
  // The server stores addresses lowercase; the wallet arrives checksummed.
  createdBy: CREATOR.toLowerCase(),
  approvedBy: null,
  approvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
}

/** Declared for its slice, approved by nobody yet, and empty — as every recurring campaign starts. */
const RECURRING: PushCampaign = {
  ...PENDING,
  id: '22222222-2222-2222-2222-222222222222',
  campaignKey: 'd3-comeback',
  isRecurring: true,
  triggerKey: 'd3',
  destinationKind: 'scene',
  audienceCount: 0,
}

function signedInAs(wallet: string) {
  mockUseAuth.mockReturnValue({ isSignedIn: true, wallet } as ReturnType<typeof useAuth>)
}

describe('PushPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthenticatedFetch.mockReturnValue(vi.fn())
    mockIsDevMode.mockReturnValue(false)
    mockFetch.mockResolvedValue([PENDING])
    mockDaily.mockResolvedValue([])
    mockStats.mockResolvedValue({
      campaign: PENDING,
      stats: { attempted: 1200, sent: 0, failed: 0, pending: 1200, cancelled: 0, inFlight: 0, errors: {} },
    })
  })

  // The two-man rule is the only thing standing between "send a campaign" and "send a
  // campaign alone". If the button silently becomes clickable, the server still refuses —
  // but the operator learns that from a 403, which reads as a bug rather than a rule.
  it('does not offer the creator a way to approve their own campaign', async () => {
    signedInAs(CREATOR)

    render(<PushPage />)

    const approve = (await screen.findByRole('button', { name: 'Approve' })) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.getAttribute('title')).toContain('someone else')

    await userEvent.click(approve)
    expect(mockApprove).not.toHaveBeenCalled()
  })

  it('offers approval to anyone else', async () => {
    signedInAs(APPROVER)
    mockApprove.mockResolvedValue({ ...PENDING, status: 'scheduled', approvedBy: APPROVER.toLowerCase() })

    render(<PushPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(expect.anything(), PENDING.id))
    expect(await screen.findByText('Scheduled')).toBeTruthy()
  })

  it('reports the rows an audience upload could not read', async () => {
    signedInAs(APPROVER)
    // The expensive mistake: columns exported the other way round parses cleanly and would
    // otherwise report a full send to nobody.
    mockUploadAudience.mockResolvedValue({
      received: 3,
      valid: 1,
      duplicates: 0,
      suppressed: 0,
      invalid: [
        { line: 2, reason: 'token too short — are the columns swapped?' },
        { line: 3, reason: 'empty user_id' },
      ],
    })

    render(<PushPage />)

    await userEvent.click(await screen.findByText('spring-event'))
    const file = new File(['user_id,fcm_token\nbad,x'], 'audience.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Audience') as HTMLInputElement, file)

    expect(await screen.findByText(/1 of 3 rows accepted/)).toBeTruthy()
    expect(screen.getByText(/columns swapped/)).toBeTruthy()
    expect(screen.getByText(/line 3: empty user_id/)).toBeTruthy()
  })

  it('says send-log numbers are not opens', async () => {
    signedInAs(APPROVER)

    render(<PushPage />)
    await userEvent.click(await screen.findByText('spring-event'))

    // Reading "1,200 sent" as "1,200 people saw it" is the mistake this page exists to
    // prevent, so the caveat is on the screen and not only in the docs.
    expect(await screen.findByText(/Opens and click-through/)).toBeTruthy()
  })

  // A recurring campaign is empty until the feed fills it, and the feed only fills one a
  // second person approved. The audience gates that protect a one-shot campaign would lock
  // this one in draft for good.
  it('approves a recurring campaign that has no audience yet, and never offers it a CSV', async () => {
    signedInAs(APPROVER)
    mockFetch.mockResolvedValue([RECURRING])

    render(<PushPage />)

    const approve = (await screen.findByRole('button', { name: 'Approve' })) as HTMLButtonElement
    expect(approve.disabled).toBe(false)
    expect(screen.queryByLabelText('Audience')).toBeNull()
    expect(screen.getByText(/recurring · d3\/scene/)).toBeTruthy()
    expect(screen.getByText(/0 queued so far/)).toBeTruthy()
  })

  it('creates a recurring campaign with the slice it serves', async () => {
    signedInAs(CREATOR)
    mockCreate.mockResolvedValue({ data: { ...RECURRING, status: 'draft' }, warnings: [] })

    render(<PushPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'New campaign' }))

    await userEvent.type(screen.getByPlaceholderText('spring-event'), 'd3-comeback')
    await userEvent.type(screen.getByLabelText(/^Title/), 'Your spot is still there')
    await userEvent.type(screen.getByLabelText(/^Body/), 'Jump back in')
    await userEvent.click(screen.getByLabelText(/Recurring, filled by the warehouse feed/))
    await userEvent.selectOptions(screen.getByLabelText(/^Trigger/), 'd3')
    await userEvent.selectOptions(screen.getByLabelText(/^Destination/), 'scene')
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ campaignKey: 'd3-comeback', isRecurring: true, triggerKey: 'd3', destinationKind: 'scene' })
      )
    )
  })

  // The report is the whole point of the button: a slice nobody serves, or rows the server
  // refused, are only visible here.
  it('reads the feed on demand and shows what it did', async () => {
    signedInAs(APPROVER)
    mockSync.mockResolvedValue({
      rowsRead: 3,
      rejected: { push_token: 2 },
      unservedSlices: ['d7/plaza'],
      notAcceptingSlices: ['d30/discover'],
      queued: 1,
      alreadyQueued: 0,
      suppressed: 0,
    })

    render(<PushPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync feed now' }))

    expect(await screen.findByText(/3 rows read · 1 queued/)).toBeTruthy()
    expect(screen.getByText(/No campaign serves: d7\/plaza/)).toBeTruthy()
    expect(screen.getByText(/Not approved yet: d30\/discover/)).toBeTruthy()
    expect(screen.getByText(/2 rows rejected: push_token/)).toBeTruthy()
  })

  it('shows sends per day with the campaigns that made them up', async () => {
    signedInAs(APPROVER)
    mockDaily.mockResolvedValue([
      { day: '2026-10-13', campaignKey: 'd3-comeback', sent: 40 },
      { day: '2026-10-13', campaignKey: 'spring-event', sent: 2 },
      { day: '2026-10-12', campaignKey: 'd3-comeback', sent: 35 },
    ])

    render(<PushPage />)

    const today = (await screen.findByText('2026-10-13')).closest('tr')!
    expect(today.textContent).toContain('42')
    expect(today.textContent).toContain('d3-comeback 40 · spring-event 2')
  })

  // The panel is new on the server too; a hub ahead of its server keeps working without it.
  it('keeps the campaigns usable when sends per day cannot be loaded', async () => {
    signedInAs(APPROVER)
    mockDaily.mockRejectedValue(new Error('404 Not Found'))

    render(<PushPage />)

    expect(await screen.findByText('spring-event')).toBeTruthy()
    expect(screen.getByText(/Not available: 404 Not Found/)).toBeTruthy()
  })
})
