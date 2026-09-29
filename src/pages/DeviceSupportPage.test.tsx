import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeviceSupportPage } from './DeviceSupportPage'
import {
  ApiError,
  fetchDeviceDecision,
  fetchDeviceSupportList,
  upsertDeviceSupport,
  bulkUpsertDeviceSupport,
  deleteDeviceSupport,
  type DeviceSupportEntry,
  type PublicDeviceDecision,
} from '../features/devices/api'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/devices/api', async () => {
  const actual = await vi.importActual<typeof import('../features/devices/api')>('../features/devices/api')
  return {
    ...actual,
    fetchDeviceDecision: vi.fn(),
    fetchDeviceSupportList: vi.fn(),
    upsertDeviceSupport: vi.fn(),
    bulkUpsertDeviceSupport: vi.fn(),
    deleteDeviceSupport: vi.fn(),
  }
})
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

  it('loads entries for editors and renders soc, decision and the audit trail', async () => {
    render(<DeviceSupportPage />)

    await screen.findByText('EXYNOS 7420')

    expect(mockFetchList).toHaveBeenCalledWith(authenticatedFetch)
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'End of support'
    )
    expect(screen.getByRole('button', { name: 'Change decision for SM6115' }).textContent).toBe(
      'Below minspec'
    )

    // Every row shows when it was last updated; only the one with an editor also names them.
    const auditLines = screen.getAllByText(/Updated/).map(el => el.textContent)
    expect(auditLines.some(t => t?.includes('by'))).toBe(true)
    expect(auditLines.some(t => !t?.includes('by'))).toBe(true)
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

  it('shows a friendly not-allowed warning instead of a raw Forbidden error', async () => {
    mockFetchList.mockRejectedValueOnce(new ApiError('Forbidden: User not in allowed list', 403))

    render(<DeviceSupportPage />)

    await screen.findByText(/wallet isn't in the allowed list/i)

    expect(screen.queryByText('Forbidden: User not in allowed list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows a session-expired message with a working sign-in button for a 401, distinct from not-allowed', async () => {
    const signIn = vi.fn()
    mockUseAuth.mockReturnValue({ isSignedIn: true, signIn } as unknown as ReturnType<typeof useAuth>)
    mockFetchList.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    render(<DeviceSupportPage />)

    await screen.findByText(/session expired/i)

    expect(screen.queryByText(/wallet isn't in the allowed list/i)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(signIn).toHaveBeenCalled()
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

  it('saves a decision change on confirm and reloads the list from the server', async () => {
    mockUpsert.mockResolvedValue({ ...EXYNOS, decision: 'below-minspec' })
    mockFetchList
      .mockResolvedValueOnce([EXYNOS, SM6115])
      .mockResolvedValueOnce([{ ...EXYNOS, decision: 'below-minspec' }, SM6115])

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpsert).toHaveBeenCalledWith(authenticatedFetch, 'EXYNOS 7420', 'below-minspec')
    expect(mockFetchList).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'Below minspec'
    )
  })

  it('keeps the dialog open and shows the raw error message for a non-auth save failure', async () => {
    mockUpsert.mockRejectedValue(new Error('Internal server error'))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await screen.findByText('Internal server error')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }).textContent).toBe(
      'End of support'
    )
  })

  it('shows the friendly not-allowed message in the confirm dialog too, not just on load', async () => {
    mockUpsert.mockRejectedValue(new ApiError('Forbidden: User not in allowed list', 403))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    // Scoped to the dialog: setting the page-level authIssue also reveals the (identically
    // worded) page banner underneath the still-open modal, so an unscoped query would be ambiguous.
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/wallet isn't in the allowed list/i)
    expect(within(dialog).queryByText('Forbidden: User not in allowed list')).toBeNull()
  })

  it('reveals the not-allowed banner after dismissing a confirm dialog that failed with a 403', async () => {
    mockUpsert.mockRejectedValue(new ApiError('Forbidden: User not in allowed list', 403))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/wallet isn't in the allowed list/i)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Not just the dialog gone -- the list/Add entry/Bulk import must not look usable anymore
    // against a session the server just rejected.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/wallet isn't in the allowed list/i)).toBeTruthy()
    expect(screen.queryByText('EXYNOS 7420')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull()
  })

  it('adds a new entry from the form and reloads the list', async () => {
    const created: DeviceSupportEntry = {
      soc: 'SM8750',
      decision: 'below-minspec',
      updatedAt: '2026-07-23T01:00:00.000Z',
      updatedBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }
    mockUpsert.mockResolvedValue(created)
    mockFetchList
      .mockResolvedValueOnce([EXYNOS, SM6115])
      .mockResolvedValueOnce([EXYNOS, SM6115, created])

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
    expect(mockFetchList).toHaveBeenCalledTimes(2)
  })

  it('routes an add-entry overwrite of an already-listed SoC through the confirm dialog', async () => {
    mockUpsert.mockResolvedValue({ ...EXYNOS, decision: 'below-minspec' })
    mockFetchList
      .mockResolvedValueOnce([EXYNOS, SM6115])
      .mockResolvedValueOnce([{ ...EXYNOS, decision: 'below-minspec' }, SM6115])

    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    // Same chip as the seeded "EXYNOS 7420", just typed without the space and lowercase.
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'exynos7420')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New entry decision' }),
      'below-minspec'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(mockUpsert).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('exynos7420')
    expect(dialog.textContent).toContain('End of support')
    expect(dialog.textContent).toContain('Below minspec')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpsert).toHaveBeenCalledWith(authenticatedFetch, 'exynos7420', 'below-minspec')
  })

  it('clears a stale add-entry error once the overwrite confirm opens', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    // First produce a stale error (the overwrite branch below returns before ever clearing it if
    // handleSave doesn't clear it up front).
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await screen.findByText('SoC is required')

    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'EXYNOS 7420')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('SoC is required')).toBeNull()
  })

  it('keeps the add-entry form open with its typed value when the overwrite confirm is cancelled', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'exynos7420')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox', { name: 'New entry SoC' }) as HTMLInputElement).value).toBe(
      'exynos7420'
    )
  })

  it('shows a "no decision change" message when an overwrite picks the same decision', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    // Decision select defaults to "exclude", matching the seeded EXYNOS 7420 exactly.
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'EXYNOS 7420')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(screen.getByRole('dialog').textContent).toContain('No decision change')
  })

  it('disables Add entry and Bulk import until the list has loaded, so neither can misreport against unknown state', async () => {
    mockFetchList.mockRejectedValue(new Error('network down'))

    render(<DeviceSupportPage />)

    await screen.findByText('network down')

    expect(screen.getByRole('button', { name: 'Add entry' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Bulk import' })).toHaveProperty('disabled', true)
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

  it('shows a friendly not-allowed message in the add-entry form too', async () => {
    mockUpsert.mockRejectedValue(new ApiError('Forbidden: User not in allowed list', 403))

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New entry SoC' }), 'SM8750')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    await screen.findByText(/wallet isn't in the allowed list/i)
    expect(screen.queryByText('Forbidden: User not in allowed list')).toBeNull()
  })

  it('deletes an entry after confirmation and reloads the list', async () => {
    mockDelete.mockResolvedValue(undefined)
    mockFetchList.mockResolvedValueOnce([EXYNOS, SM6115]).mockResolvedValueOnce([SM6115])

    render(<DeviceSupportPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete EXYNOS 7420' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Change decision for EXYNOS 7420' })).toBeNull()
    )
    expect(mockDelete).toHaveBeenCalledWith(authenticatedFetch, 'EXYNOS 7420')
    expect(mockFetchList).toHaveBeenCalledTimes(2)
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
    expect(dialog.textContent).toContain('keep their current value')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, import' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockBulkUpsert).toHaveBeenCalledWith(authenticatedFetch, [
      { soc: 'SM4350', decision: 'exclude' },
      { soc: 'SM6115', decision: 'below-minspec' },
    ])
    expect(mockFetchList).toHaveBeenCalledTimes(2)
  })

  it('shows the new/changed/unchanged breakdown in the bulk-import preview', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      // SM4350 is new, EXYNOS 7420 changes decision, SM6115 stays the same.
      target: { value: 'SM4350,exclude\nEXYNOS 7420,below-minspec\nSM6115,below-minspec' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('3 entries')
    expect(dialog.textContent).toContain('1 new')
    expect(dialog.textContent).toContain('1 changed')
    expect(dialog.textContent).toContain('1 unchanged')
  })

  it('dedupes repeated SoCs in a bulk paste, keeping the last decision', async () => {
    mockBulkUpsert.mockResolvedValue(1)

    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      target: { value: 'SM4350,exclude\nsm4350,below-minspec' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(screen.getByRole('dialog').textContent).toContain('1 entries')

    await userEvent.click(screen.getByRole('button', { name: 'Yes, import' }))

    await waitFor(() => expect(mockBulkUpsert).toHaveBeenCalled())
    expect(mockBulkUpsert).toHaveBeenCalledWith(authenticatedFetch, [
      { soc: 'sm4350', decision: 'below-minspec' },
    ])
  })

  it('rejects a bulk paste over the entry cap after deduping', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    const tooMany = Array.from({ length: 1001 }, (_, i) => `SOC${i},exclude`).join('\n')
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      target: { value: tooMany },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    await screen.findByText(/At most 1000 entries per import/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockBulkUpsert).not.toHaveBeenCalled()
  })

  it('shows every bulk-import parse error, not just the first', async () => {
    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.click(screen.getByRole('button', { name: 'Bulk import' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Bulk import entries' }), {
      target: { value: 'BAD_LINE_NO_COMMA\nSM4350,not-a-decision' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByText(/Line 1: expected "soc,decision"/)).toBeTruthy()
    expect(screen.getByText(/Line 2: decision must be/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockBulkUpsert).not.toHaveBeenCalled()
  })

  it('ignores a stale response from React StrictMode double-invoking the mount effect', async () => {
    // The real app renders inside <StrictMode> (see main.tsx), which intentionally fires effects
    // twice on mount in development -- so the initial loadEntries() call genuinely runs twice, and
    // an out-of-order resolution between them is a real scenario, not just a theoretical one.
    // (Add entry/Bulk import are disabled while entries is null, and the confirm modal blocks
    // everything else while a mutation's own reload is in flight, so this is the one path left.)
    let resolveFirst: (value: DeviceSupportEntry[]) => void = () => {}
    const firstPromise = new Promise<DeviceSupportEntry[]>(resolve => {
      resolveFirst = resolve
    })
    mockFetchList.mockReturnValueOnce(firstPromise).mockResolvedValueOnce([SM6115])

    render(
      <StrictMode>
        <DeviceSupportPage />
      </StrictMode>
    )

    await screen.findByText('SM6115')
    expect(screen.queryByText('EXYNOS 7420')).toBeNull()

    // The first mount's stale request finally resolves -- it must not resurrect the old list.
    resolveFirst([EXYNOS, SM6115])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(screen.queryByText('EXYNOS 7420')).toBeNull()
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

  it('clears the lookup result after a mutation elsewhere on the page, not just a new lookup', async () => {
    mockFetchDecision.mockResolvedValue('below-minspec')
    mockUpsert.mockResolvedValue({ ...EXYNOS, decision: 'below-minspec' })
    mockFetchList
      .mockResolvedValueOnce([EXYNOS, SM6115])
      .mockResolvedValueOnce([{ ...EXYNOS, decision: 'below-minspec' }, SM6115])

    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    await userEvent.type(screen.getByRole('textbox', { name: 'SoC to look up' }), 'SM7125')
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    // "SM7125" isn't a seeded soc, so its presence is only ever the lookup result.
    await screen.findByText('SM7125')

    await userEvent.click(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(screen.queryByText('SM7125')).toBeNull()
  })

  it('discards an in-flight lookup response that resolves after a mutation invalidates it', async () => {
    let resolveLookup: (value: PublicDeviceDecision) => void = () => {}
    const lookupPromise = new Promise<PublicDeviceDecision>(resolve => {
      resolveLookup = resolve
    })
    mockFetchDecision.mockReturnValueOnce(lookupPromise)
    mockUpsert.mockResolvedValue({ ...EXYNOS, decision: 'below-minspec' })
    mockFetchList
      .mockResolvedValueOnce([EXYNOS, SM6115])
      .mockResolvedValueOnce([{ ...EXYNOS, decision: 'below-minspec' }, SM6115])

    render(<DeviceSupportPage />)
    await screen.findByText('EXYNOS 7420')

    // Start a lookup and leave it pending.
    await userEvent.type(screen.getByRole('textbox', { name: 'SoC to look up' }), 'SM8750')
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))

    // While it's still in flight, a mutation elsewhere invalidates the (not yet delivered) result.
    await userEvent.click(screen.getByRole('button', { name: 'Change decision for EXYNOS 7420' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // The stale lookup finally resolves -- it must not resurrect a pre-write result.
    resolveLookup('exclude')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(screen.queryByText('SM8750')).toBeNull()
  })

  it('ignores an earlier lookup response that resolves after a later one', async () => {
    let resolveFirst: (value: PublicDeviceDecision) => void = () => {}
    let resolveSecond: (value: PublicDeviceDecision) => void = () => {}
    const firstPromise = new Promise<PublicDeviceDecision>(resolve => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<PublicDeviceDecision>(resolve => {
      resolveSecond = resolve
    })
    mockFetchDecision.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    render(<DeviceSupportPage />)

    const input = screen.getByRole('textbox', { name: 'SoC to look up' })

    await userEvent.type(input, 'SM7125{Enter}')
    await userEvent.clear(input)
    await userEvent.type(input, 'SM8750{Enter}')

    // The later (second) request resolves first...
    resolveSecond('exclude')
    const resultSoc = await screen.findByText('SM8750')
    expect(resultSoc.closest('.device-lookup-result')?.textContent).toContain('End of support')

    // ...so the earlier (first) request resolving afterwards must not clobber it. SM6115 (seed
    // data) already renders "Below minspec" elsewhere on the page, so assert on the SoC in the
    // result rather than the decision label, which would pass even if the race clobbered it.
    resolveFirst('below-minspec')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(screen.getByText('SM8750')).toBeTruthy()
    expect(screen.queryByText('SM7125')).toBeNull()
  })
})
