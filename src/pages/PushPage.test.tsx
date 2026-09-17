import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushPage } from './PushPage'
import {
  fetchPushCampaigns,
  approvePushCampaign,
  uploadPushAudience,
  fetchPushCampaignStats,
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
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetch = vi.mocked(fetchPushCampaigns)
const mockApprove = vi.mocked(approvePushCampaign)
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
  audienceCount: 1200,
  // The server stores addresses lowercase; the wallet arrives checksummed.
  createdBy: CREATOR.toLowerCase(),
  approvedBy: null,
  approvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
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
})
