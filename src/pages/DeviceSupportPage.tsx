import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
  ApiError,
  fetchDeviceDecision,
  fetchDeviceSupportList,
  upsertDeviceSupport,
  bulkUpsertDeviceSupport,
  deleteDeviceSupport,
  type DeviceSupportEntry,
  type DeviceDecision,
  type PublicDeviceDecision,
  type BulkUpsertEntry,
} from '../features/devices/api'
import './DeviceSupportPage.css'

// Mirrors the mobile-bff logic/device-support.ts constant of the same name. No shared package
// between the two repos, so this has to be kept in sync by hand.
const SOC_MAX_LENGTH = 64
// Mirrors bulk-upsert-device-support-handler.ts's MAX_BULK_ENTRIES -- same caveat as above.
const MAX_BULK_ENTRIES = 1000
const MAX_DISPLAYED_ERRORS = 20

type ConfirmAction =
  | { kind: 'upsert'; soc: string; from: DeviceDecision; next: DeviceDecision }
  | { kind: 'bulk-upsert'; entries: BulkUpsertEntry[]; newCount: number; changedCount: number; unchangedCount: number }
  | { kind: 'delete'; soc: string }

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; action: ConfirmAction }
  | { status: 'saving'; action: ConfirmAction }
  | { status: 'error'; action: ConfirmAction; message: string }

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

function sortBySoc(entries: DeviceSupportEntry[]): DeviceSupportEntry[] {
  return [...entries].sort((a, b) => a.soc.localeCompare(b.soc))
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function decisionLabel(decision: DeviceDecision): string {
  return decision === 'exclude' ? 'End of support' : 'Below minspec'
}

function publicDecisionLabel(decision: PublicDeviceDecision): string {
  return decision === 'keep' ? 'Fully supported' : decisionLabel(decision)
}

function otherDecision(decision: DeviceDecision): DeviceDecision {
  return decision === 'exclude' ? 'below-minspec' : 'exclude'
}

// Matches the backend's identity for a chipset: soc_key = REPLACE(UPPER(TRIM(soc_model)), ' ', '').
// Needed client-side to pre-detect "this SoC is already listed" (for the overwrite confirm and the
// bulk-import preview) -- the actual list state itself is always refreshed from the server after a
// mutation rather than patched locally, so this is only ever used against a just-loaded snapshot.
function socKey(soc: string): string {
  return soc.trim().toUpperCase().replace(/ /g, '')
}

// 401 means the signed-fetch identity is missing or its TTL expired -- recoverable by signing in
// again. 403 means the signature is fine but the address isn't in ALLOWED_USERS -- only an admin
// can fix that. They read very differently to an operator, so keep them distinct everywhere an
// error surfaces, not just on the initial list load.
function classifyAuthError(err: unknown): 'expired' | 'not-allowed' | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 401) return 'expired'
  if (err.status === 403) return 'not-allowed'
  return null
}

function friendlyErrorMessage(err: unknown, fallback: string): string {
  const authIssue = classifyAuthError(err)
  if (authIssue === 'expired') return 'Your session expired — sign in again to continue.'
  if (authIssue === 'not-allowed') return "Your wallet isn't in the allowed list for device support edits."
  return err instanceof Error ? err.message : fallback
}

function parseBulkInput(text: string): { entries: BulkUpsertEntry[]; errors: string[] } {
  const bySocKey = new Map<string, BulkUpsertEntry>()
  const errors: string[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) return

    const parts = line.split(/[,\t]/).map(p => p.trim())
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push(`Line ${index + 1}: expected "soc,decision"`)
      return
    }

    const [soc, rawDecision] = parts
    if (soc.length > SOC_MAX_LENGTH) {
      errors.push(`Line ${index + 1}: SoC must be at most ${SOC_MAX_LENGTH} characters`)
      return
    }
    const decision = rawDecision.toLowerCase()
    if (decision !== 'exclude' && decision !== 'below-minspec') {
      errors.push(`Line ${index + 1}: decision must be "exclude" or "below-minspec", got "${rawDecision}"`)
      return
    }

    // Last occurrence for a given key wins, matching what the server does when the same soc_key
    // appears twice in one bulkUpsert batch -- deduping here keeps the "N entries" count (and the
    // preview below) an accurate reflection of what actually gets written.
    bySocKey.set(socKey(soc), { soc, decision })
  })

  return { entries: [...bySocKey.values()], errors }
}

export const DeviceSupportPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn, signIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [entries, setEntries] = useState<DeviceSupportEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authIssue, setAuthIssue] = useState<'expired' | 'not-allowed' | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  // Guards loadEntries the same way DeviceLookup guards its own request: Retry, and every
  // mutation's post-save refresh, all call it, and a slower earlier call landing after a faster
  // later one would otherwise show stale data.
  const loadRequestIdRef = useRef(0)
  // Bumped after every successful mutation so the (otherwise independent) lookup widget below
  // drops a stale result rather than keep showing the pre-edit decision as if it were current.
  const [lookupInvalidation, setLookupInvalidation] = useState(0)
  const invalidateLookup = () => setLookupInvalidation(v => v + 1)

  const loadEntries = useCallback(async () => {
    if (!canEdit) {
      setIsLoading(false)
      return
    }
    const requestId = ++loadRequestIdRef.current
    setIsLoading(true)
    setLoadError(null)
    setAuthIssue(null)
    try {
      const fetched = sortBySoc(await fetchDeviceSupportList(authenticatedFetch))
      if (loadRequestIdRef.current !== requestId) return
      setEntries(fetched)
    } catch (err) {
      if (loadRequestIdRef.current !== requestId) return
      const issue = classifyAuthError(err)
      if (issue) {
        setAuthIssue(issue)
      } else {
        setLoadError(err instanceof Error ? err.message : 'Failed to load device support entries')
      }
    } finally {
      if (loadRequestIdRef.current === requestId) setIsLoading(false)
    }
  }, [canEdit, authenticatedFetch])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleEntrySaved = () => {
    setShowAddEntry(false)
    loadEntries()
    invalidateLookup()
  }

  const handleRequestOverwrite = (existing: DeviceSupportEntry, soc: string, decision: DeviceDecision) => {
    // Leave the add form open (just covered by the modal) so cancelling the confirm doesn't lose
    // what was typed -- it only closes once handleConfirmAction's upsert branch actually succeeds.
    setConfirm({
      status: 'confirming',
      action: { kind: 'upsert', soc, from: existing.decision, next: decision },
    })
  }

  const handleToggleDecision = (entry: DeviceSupportEntry) => {
    setConfirm({
      status: 'confirming',
      action: { kind: 'upsert', soc: entry.soc, from: entry.decision, next: otherDecision(entry.decision) },
    })
  }

  const handleRequestDelete = (entry: DeviceSupportEntry) => {
    setConfirm({ status: 'confirming', action: { kind: 'delete', soc: entry.soc } })
  }

  const handleBulkParsed = (parsedEntries: BulkUpsertEntry[]) => {
    const currentByKey = new Map((entries ?? []).map(e => [socKey(e.soc), e]))
    let newCount = 0
    let changedCount = 0
    let unchangedCount = 0
    for (const entry of parsedEntries) {
      const existing = currentByKey.get(socKey(entry.soc))
      if (!existing) newCount++
      else if (existing.decision !== entry.decision) changedCount++
      else unchangedCount++
    }
    setConfirm({
      status: 'confirming',
      action: { kind: 'bulk-upsert', entries: parsedEntries, newCount, changedCount, unchangedCount },
    })
  }

  const handleConfirmAction = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { action } = confirm
    setConfirm({ status: 'saving', action })
    try {
      if (action.kind === 'upsert') {
        await upsertDeviceSupport(authenticatedFetch, action.soc, action.next)
        // A no-op when this upsert came from the row chip rather than an add-entry overwrite --
        // the form is already closed in that case.
        setShowAddEntry(false)
        await loadEntries()
      } else if (action.kind === 'bulk-upsert') {
        await bulkUpsertDeviceSupport(authenticatedFetch, action.entries)
        setShowBulkImport(false)
        await loadEntries()
      } else {
        await deleteDeviceSupport(authenticatedFetch, action.soc)
        await loadEntries()
      }
      setConfirm({ status: 'idle' })
      invalidateLookup()
    } catch (err) {
      // The dialog explains this specific action's failure, but the list/Add entry/Bulk import
      // underneath would otherwise still look usable against a session the server just rejected --
      // set the page-level state too so dismissing the dialog reveals the real (banner) state
      // instead of a stale "everything's fine" view.
      const issue = classifyAuthError(err)
      if (issue) setAuthIssue(issue)
      setConfirm({
        status: 'error',
        action,
        message: friendlyErrorMessage(err, 'Failed to save'),
      })
    }
  }

  const handleCloseConfirm = () => {
    setConfirm({ status: 'idle' })
  }

  return (
    <div className="devices-page">
      <div className="devices-container">
        <header className="devices-header">
          <h1>Device Support</h1>
          <p>
            Per-chipset overrides behind godot-explorer's device-support-modals: the client sends
            the one SoC it detected to <code>GET /device-support</code> and gets back{' '}
            <code>exclude</code>, <code>below-minspec</code> or <code>keep</code>. A chip absent
            from the list below is implicitly <code>keep</code>.
          </p>
        </header>

        <DeviceLookup invalidatedBy={lookupInvalidation} />

        {!canEdit && (
          <div className="devices-warning">
            Sign in with an allowed wallet to view and manage the override list.
          </div>
        )}

        {canEdit && authIssue === 'not-allowed' && (
          <div className="devices-warning">
            Your wallet isn't in the allowed list for device support edits — ask an admin to add
            it.
          </div>
        )}

        {canEdit && authIssue === 'expired' && (
          <div className="devices-warning">
            Your session expired.{' '}
            <button className="devices-link-button" onClick={signIn}>
              Sign in again
            </button>
          </div>
        )}

        {canEdit && !authIssue && (
          <>
            <div className="devices-header-row">
              <h2>Overrides</h2>
              <div className="devices-header-actions">
                <button
                  className="devices-button-secondary"
                  disabled={entries === null}
                  title={entries === null ? 'Load the list before bulk importing' : undefined}
                  onClick={() => {
                    setShowBulkImport(v => !v)
                    setShowAddEntry(false)
                  }}
                >
                  {showBulkImport ? 'Cancel bulk import' : 'Bulk import'}
                </button>
                <button
                  className="devices-button-primary"
                  disabled={entries === null}
                  title={entries === null ? 'Load the list before adding an entry' : undefined}
                  onClick={() => {
                    setShowAddEntry(v => !v)
                    setShowBulkImport(false)
                  }}
                >
                  {showAddEntry ? 'Cancel' : 'Add entry'}
                </button>
              </div>
            </div>

            {showAddEntry && (
              <AddEntryForm
                authenticatedFetch={authenticatedFetch}
                entries={entries}
                onSaved={handleEntrySaved}
                onRequestOverwrite={handleRequestOverwrite}
                onCancel={() => setShowAddEntry(false)}
              />
            )}

            {showBulkImport && (
              <BulkImportForm onParsed={handleBulkParsed} onCancel={() => setShowBulkImport(false)} />
            )}

            {isLoading && <div className="devices-loading">Loading…</div>}
            {loadError && (
              <div className="devices-error">
                {loadError}{' '}
                <button className="devices-link-button" onClick={loadEntries}>
                  Retry
                </button>
              </div>
            )}

            {entries && (
              <div className="devices-list">
                {entries.length === 0 && <div className="devices-empty">No overrides yet.</div>}
                {entries.map(entry => (
                  <DeviceRow
                    key={entry.soc}
                    entry={entry}
                    onToggleDecision={() => handleToggleDecision(entry)}
                    onRequestDelete={() => handleRequestDelete(entry)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog state={confirm} onConfirm={handleConfirmAction} onCancel={handleCloseConfirm} />
      )}
    </div>
  )
}

const DeviceLookup: FC<{ invalidatedBy: number }> = ({ invalidatedBy }) => {
  const [soc, setSoc] = useState('')
  const [result, setResult] = useState<{ soc: string; decision: PublicDeviceDecision } | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guards against an earlier, slower request's response landing after a later one's and
  // clobbering it -- e.g. two fast Enters while the first lookup is still in flight.
  const requestIdRef = useRef(0)

  // This widget is otherwise independent of the edit flow below, so a result it already fetched
  // doesn't get refreshed on its own -- drop it after any mutation rather than let it keep
  // showing the pre-edit decision right when an operator would read it as confirmation.
  useEffect(() => {
    setResult(null)
  }, [invalidatedBy])

  const handleCheck = async () => {
    const trimmed = soc.trim()
    if (!trimmed) return
    const requestId = ++requestIdRef.current
    setChecking(true)
    setError(null)
    setResult(null)
    try {
      const decision = await fetchDeviceDecision(trimmed)
      if (requestIdRef.current !== requestId) return
      setResult({ soc: trimmed, decision })
    } catch (err) {
      if (requestIdRef.current !== requestId) return
      setError(err instanceof Error ? err.message : 'Failed to check device')
    } finally {
      if (requestIdRef.current === requestId) setChecking(false)
    }
  }

  return (
    <section className="device-lookup">
      <h2>Look up a device</h2>
      <p>
        Calls the public <code>GET /device-support</code> the client itself uses: send one SoC,
        get back what the app would decide for it.
      </p>
      <div className="device-lookup-row">
        <input
          aria-label="SoC to look up"
          value={soc}
          maxLength={SOC_MAX_LENGTH}
          placeholder="e.g. SM7125"
          onChange={e => setSoc(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCheck()
          }}
        />
        <button
          className="devices-button-primary"
          onClick={handleCheck}
          disabled={checking || !soc.trim()}
        >
          {checking ? 'Checking…' : 'Check'}
        </button>
      </div>
      {error && <div className="devices-error">{error}</div>}
      {result && (
        <div className={`device-lookup-result device-decision-${result.decision}`}>
          <code>{result.soc}</code> → {publicDecisionLabel(result.decision)}
        </div>
      )}
    </section>
  )
}

const DeviceRow: FC<{
  entry: DeviceSupportEntry
  onToggleDecision: () => void
  onRequestDelete: () => void
}> = ({ entry, onToggleDecision, onRequestDelete }) => (
  <section className="device-row">
    <div className="device-row-main">
      <div className="device-row-labels">
        <span className="device-row-soc">{entry.soc}</span>
        <span className="device-row-audit">
          Updated {new Date(entry.updatedAt).toLocaleString()}
          {entry.updatedBy ? ` by ${shortAddress(entry.updatedBy)}` : ''}
        </span>
      </div>
      <div className="device-row-actions">
        <button
          className="device-icon-button device-icon-button-danger"
          aria-label={`Delete ${entry.soc}`}
          title="Delete entry"
          onClick={onRequestDelete}
        >
          ✕
        </button>
        <button
          className={`device-decision-chip device-decision-${entry.decision}`}
          aria-label={`Change decision for ${entry.soc}`}
          title={`Change to ${decisionLabel(otherDecision(entry.decision))}`}
          onClick={onToggleDecision}
        >
          {decisionLabel(entry.decision)}
        </button>
      </div>
    </div>
  </section>
)

const AddEntryForm: FC<{
  authenticatedFetch: AuthenticatedFetch
  entries: DeviceSupportEntry[] | null
  onSaved: () => void
  onRequestOverwrite: (existing: DeviceSupportEntry, soc: string, decision: DeviceDecision) => void
  onCancel: () => void
}> = ({ authenticatedFetch, entries, onSaved, onRequestOverwrite, onCancel }) => {
  const [soc, setSoc] = useState('')
  const [decision, setDecision] = useState<DeviceDecision>('exclude')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmed = soc.trim()
    if (!trimmed) {
      setError('SoC is required')
      return
    }
    // A stale error from a previous attempt would otherwise sit under the confirm dialog (the
    // overwrite branch below returns without ever reaching a save that could clear it) or linger
    // needlessly if this attempt succeeds outright.
    setError(null)

    // Without a loaded list there's no way to tell an overwrite from a fresh entry -- refuse
    // rather than risk silently clobbering a live override the operator can't currently see.
    if (entries === null) {
      setError("Can't verify whether this SoC already exists — reload the list and try again")
      return
    }

    // An already-listed SoC is a decision change on a live override, not a fresh entry -- route
    // it through the same confirm-with-diff flow as toggling a row, instead of overwriting silently.
    const existing = entries.find(e => socKey(e.soc) === socKey(trimmed))
    if (existing) {
      onRequestOverwrite(existing, trimmed, decision)
      return
    }

    setSaving(true)
    try {
      await upsertDeviceSupport(authenticatedFetch, trimmed, decision)
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err, 'Failed to save device support entry'))
      setSaving(false)
    }
  }

  return (
    <section className="device-create-form">
      <h2>Add or update entry</h2>
      <label className="device-create-field">
        <span>SoC</span>
        <input
          aria-label="New entry SoC"
          value={soc}
          maxLength={SOC_MAX_LENGTH}
          placeholder="EXYNOS 7420"
          onChange={e => setSoc(e.target.value)}
        />
      </label>
      <label className="device-create-field">
        <span>Decision</span>
        <select
          aria-label="New entry decision"
          value={decision}
          onChange={e => setDecision(e.target.value as DeviceDecision)}
        >
          <option value="exclude">End of support (exclude)</option>
          <option value="below-minspec">Below minspec</option>
        </select>
      </label>
      {error && <div className="devices-error">{error}</div>}
      <div className="device-create-actions">
        <button className="devices-button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="devices-button-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </section>
  )
}

const BulkImportForm: FC<{
  onParsed: (entries: BulkUpsertEntry[]) => void
  onCancel: () => void
}> = ({ onParsed, onCancel }) => {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const handlePreview = () => {
    const { entries, errors: parseErrors } = parseBulkInput(text)
    if (parseErrors.length > 0) {
      setErrors(parseErrors)
      return
    }
    if (entries.length === 0) {
      setErrors(['Paste at least one "soc,decision" line'])
      return
    }
    if (entries.length > MAX_BULK_ENTRIES) {
      setErrors([`At most ${MAX_BULK_ENTRIES} entries per import (${entries.length} after removing duplicates)`])
      return
    }
    setErrors([])
    onParsed(entries)
  }

  return (
    <section className="device-create-form">
      <h2>Bulk import</h2>
      <p className="device-bulk-hint">
        One entry per line: <code>SOC,decision</code> (comma or tab separated) — decision is{' '}
        <code>exclude</code> or <code>below-minspec</code>. Lines starting with <code>#</code> are
        ignored. A SoC repeated in the paste keeps only its last line.
      </p>
      <textarea
        aria-label="Bulk import entries"
        value={text}
        rows={8}
        placeholder={'EXYNOS 7420,exclude\nSM6115,below-minspec'}
        onChange={e => setText(e.target.value)}
      />
      {errors.length > 0 && (
        <div className="devices-error">
          <ul className="devices-error-list">
            {errors.slice(0, MAX_DISPLAYED_ERRORS).map(e => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > MAX_DISPLAYED_ERRORS && <li>…and {errors.length - MAX_DISPLAYED_ERRORS} more</li>}
          </ul>
        </div>
      )}
      <div className="device-create-actions">
        <button className="devices-button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="devices-button-primary" onClick={handlePreview}>
          Preview import
        </button>
      </div>
    </section>
  )
}

const ConfirmDialog: FC<{
  state: Exclude<ConfirmState, { status: 'idle' }>
  onConfirm: () => void
  onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
  const { action } = state
  const saving = state.status === 'saving'
  const errorMessage = state.status === 'error' ? state.message : null
  const isDelete = action.kind === 'delete'
  const isBulk = action.kind === 'bulk-upsert'

  return (
    <div className="devices-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div className="devices-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>
          {isDelete ? 'Delete device support entry' : isBulk ? 'Confirm bulk import' : 'Confirm decision change'}
        </h3>
        <p>
          {isDelete
            ? 'This permanently removes the override. The device falls back to "keep" (fully supported).'
            : isBulk
              ? 'Entries not listed here keep their current value — this only touches the SoCs below.'
              : 'This will change what the app decides for this chipset immediately.'}
        </p>

        {action.kind === 'upsert' && (
          <div className="devices-diff">
            <code>{action.soc}</code>
            {action.from === action.next ? (
              <span className="devices-diff-value">No decision change — refreshes who/when this was last confirmed.</span>
            ) : (
              <span className="devices-diff-value">
                <span className="devices-diff-from">{decisionLabel(action.from)}</span>
                <span className="devices-diff-arrow">→</span>
                <span className="devices-diff-to">{decisionLabel(action.next)}</span>
              </span>
            )}
          </div>
        )}

        {action.kind === 'delete' && (
          <div className="devices-diff">
            <code>{action.soc}</code>
            <span className="devices-diff-value devices-diff-delete">will be removed</span>
          </div>
        )}

        {action.kind === 'bulk-upsert' && (
          <div className="devices-bulk-preview">
            <p className="devices-bulk-count">
              {action.entries.length} entries — {action.newCount} new, {action.changedCount} changed
              {action.unchangedCount > 0 ? `, ${action.unchangedCount} unchanged` : ''}
            </p>
            <ul>
              {action.entries.slice(0, 8).map(e => (
                <li key={e.soc}>
                  <code>{e.soc}</code> → {decisionLabel(e.decision)}
                </li>
              ))}
              {action.entries.length > 8 && <li>…and {action.entries.length - 8} more</li>}
            </ul>
          </div>
        )}

        {errorMessage && <div className="devices-error">{errorMessage}</div>}

        <div className="devices-modal-actions">
          <button className="devices-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className={isDelete ? 'devices-button-danger' : 'devices-button-primary'}
            onClick={onConfirm}
            disabled={saving}
          >
            {saving
              ? isDelete
                ? 'Deleting…'
                : isBulk
                  ? 'Importing…'
                  : 'Saving…'
              : isDelete
                ? 'Yes, delete'
                : isBulk
                  ? 'Yes, import'
                  : 'Yes, save'}
          </button>
        </div>
      </div>
    </div>
  )
}
