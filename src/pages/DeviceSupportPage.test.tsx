import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeviceSupportPage } from './DeviceSupportPage'
import {
  fetchDeviceDecision,
  fetchDeviceSupportList,
  upsertDeviceSupport,
  bulkUpsertDeviceSupport,
  deleteDeviceSupport,
  type DeviceSupportEntry,
} from '../features/devices/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/devices/api', () => ({
  fetchDeviceDecision: vi.fn(),
  fetchDeviceSupportList: vi.fn(),
  upsertDeviceSupport: vi.fn(),
  bulkUpsertDeviceSupport: vi.fn(),
  deleteDeviceSupport: vi.fn(),
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockFetchDecision = vi.mocked(fetchDeviceDecision)
const mockFetchList = vi.mocked(fetchDeviceSupportList)
const mockUpsert = vi.mocked(upsertDeviceSupport)
const mockBulkUpsert = vi.mocked(bulkUpsertDeviceSupport)
const mockDelete = vi.mocked(deleteDeviceSupport)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()

const EXYNOS: DeviceSupportEntry = {
  soc: 'EXYNOS 7420',
  decision: 'exclude',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: null,
}

const SM6115: DeviceSupportEntry = {
  soc: 'SM6115',
  decision: 'below-minspec',
  updatedAt: '2026-07-23T00:00:00.000Z',
  updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
}

describe('DeviceSupportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<typeof useAuth>)
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    mockFetchList.mockResolvedValue([EXYNOS, SM6115])
  })

  it('loads entries for editors and renders soc and decision', async () => {
    render(<DeviceSupportPage />)

    await screen.findByText('EXYNOS 7420')

    expect(mockFetchList).toHaveBeenCalledWith(authenticatedFetch)
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'End of support'
    )
    expect(screen.getByRole('button', { name: 'Change decision for SM6115' }).textContent).toBe(
      'Below minspec'
    )
    expect(screen.getByText(/Updated by/)).toBeTruthy()
  })

  it('shows a sign-in warning and skips the list fetch for read-only viewers', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)
    mockIsDevMode.mockReturnValue(false)

    render(<DeviceSupportPage />)

    await screen.findByText(/sign in with an allowed wallet/i)

    expect(mockFetchList).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bulk import' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'SoC to look up' })).toBeTruthy()
  })

  it('shows the load error with a Retry button that refetches', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('network down'))

    render(<DeviceSupportPage />)

    await screen.findByText('network down')

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('EXYNOS 7420')
    expect(mockFetchList).toHaveBeenCalledTimes(2)
  })

  it('opens a confirm dialog when changing a decision and does nothing on cancel', async () => {
    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('EXYNOS 7420')
    expect(dialog.textContent).toContain('End of support')
    expect(dialog.textContent).toContain('Below minspec')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('saves a decision change on confirm and re-renders from the returned entry', async () => {
    mockUpsert.mockResolvedValue({ ...EXYNOS, decision: 'below-minspec' })

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpsert).toHaveBeenCalledWith(authenticatedFetch, 'EXYNOS 7420', 'below-minspec')
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'Below minspec'
    )
  })

  it('keeps the dialog open and shows the error message when the save fails', async () => {
    mockUpsert.mockRejectedValue(new Error('Forbidden: User not in allowed list'))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await screen.findByText('Forbidden: User not in allowed list')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'End of support'
    )
  })

  it('adds a new entry from the form', async () => {
    const created: DeviceSupportEntry = {
      soc: 'SM8750',
      decision: 'below-minspec',
      updatedAt: '2026-07-23T01:00:00.000Z',
      updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }
    mockUpsert.mockResolvedValue(created)

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'SM8750')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New entry decision' }),
      'below-minspec'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    await screen.findByRole('button', { name: 'Change decision for SM8750' })
    expect(mockUpsert).toHaveBeenCalledWith(authenticatedFetch, 'SM8750', 'below-minspec')
  })

  it('rejects an empty SoC in the add-entry form client-side', async () => {
    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    await screen.findByText('SoC is required')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('shows the server error when the add-entry save fails', async () => {
    mockUpsert.mockRejectedValue(new Error("'soc' must be at most 64 characters"))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'SM8750')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    await screen.findByText("'soc' must be at most 64 characters")
  })

  it('deletes an entry after confirmation', async () => {
    mockDelete.mockResolvedValue(undefined)

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete EXYNOS 7420' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Change decision for EXYNOS 7420' })).toBeNull()
    )
    expect(mockDelete).toHaveBeenCalledWith(authenticatedFetch, 'EXYNOS 7420')
    expect(screen.getByRole('button', { name: 'Change decision for SM6115' })).toBeTruthy()
  })

  it('parses and previews a bulk import, then imports on confirm', async () => {
    mockBulkUpsert.mockResolvedValue(2)

    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      target: { value: 'SM4350,exclude\nSM6115,below-minspec' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('2 entries')
    expect(dialog.textContent).toContain('SM4350')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, import' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockBulkUpsert).toHaveBeenCalledWith(authenticatedFetch, [
      { soc: 'SM4350', decision: 'exclude' },
      { soc: 'SM6115', decision: 'below-minspec' },
    ])
    expect(mockFetchList).toHaveBeenCalledTimes(2)
  })

  it('shows a parse error for a malformed bulk-import line without opening the confirm dialog', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      target: { value: 'SM4350,not-a-real-decision' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    await screen.findByText(/decision must be "exclude" or "below-minspec"/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockBulkUpsert).not.toHaveBeenCalled()
  })

  it('looks up a device via the public endpoint and shows the decision', async () => {
    mockFetchDecision.mockResolvedValue('below-minspec')

    render(<DeviceSupportPage />)

    await userEvent.type(screen.getByRole('textbox', { name: 'SoC to look up' }), 'SM7125')
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))

    await screen.findByText('Below minspec')
    expect(mockFetchDecision).toHaveBeenCalledWith('SM7125')
  })

  it('shows an error when the public lookup fails', async () => {
    mockFetchDecision.mockRejectedValue(new Error("'soc' is required and must be a non-empty string"))

    render(<DeviceSupportPage />)

    await userEvent.type(screen.getByRole('textbox', { name: 'SoC to look up' }), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))

    await screen.findByText("'soc' is required and must be a non-empty string")
  })
})
