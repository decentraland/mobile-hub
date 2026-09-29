import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
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

type ConfirmAction =
  | { kind: 'upsert'; soc: string; from: DeviceDecision; next: DeviceDecision }
  | { kind: 'bulk-upsert'; entries: BulkUpsertEntry[] }
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

function parseBulkInput(text: string): { entries: BulkUpsertEntry[]; errors: string[] } {
  const entries: BulkUpsertEntry[] = []
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
    const decision = rawDecision.toLowerCase()
    if (decision !== 'exclude' && decision !== 'below-minspec') {
      errors.push(`Line ${index + 1}: decision must be "exclude" or "below-minspec", got "${rawDecision}"`)
      return
    }

    entries.push({ soc, decision })
  })

  return { entries, errors }
}

export const DeviceSupportPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [entries, setEntries] = useState<DeviceSupportEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)

  const loadEntries = useCallback(async () => {
    if (!canEdit) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    try {
      setEntries(sortBySoc(await fetchDeviceSupportList(authenticatedFetch)))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load device support entries')
    } finally {
      setIsLoading(false)
    }
  }, [canEdit, authenticatedFetch])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const replaceEntry = (updated: DeviceSupportEntry) => {
    setEntries(prev => (prev ? prev.map(e => (e.soc === updated.soc ? updated : e)) : prev))
  }

  const handleEntrySaved = (entry: DeviceSupportEntry) => {
    setEntries(prev => {
      const list = prev ?? []
      const exists = list.some(e => e.soc === entry.soc)
      const next = exists ? list.map(e => (e.soc === entry.soc ? entry : e)) : [...list, entry]
      return sortBySoc(next)
    })
    setShowAddEntry(false)
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
    setConfirm({ status: 'confirming', action: { kind: 'bulk-upsert', entries: parsedEntries } })
  }

  const handleConfirmAction = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { action } = confirm
    setConfirm({ status: 'saving', action })
    try {
      if (action.kind === 'upsert') {
        const updated = await upsertDeviceSupport(authenticatedFetch, action.soc, action.next)
        replaceEntry(updated)
      } else if (action.kind === 'bulk-upsert') {
        await bulkUpsertDeviceSupport(authenticatedFetch, action.entries)
        setShowBulkImport(false)
        await loadEntries()
      } else {
        await deleteDeviceSupport(authenticatedFetch, action.soc)
        setEntries(prev => (prev ? prev.filter(e => e.soc !== action.soc) : prev))
      }
      setConfirm({ status: 'idle' })
    } catch (err) {
      setConfirm({
        status: 'error',
        action,
        message: err instanceof Error ? err.message : 'Failed to save',
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

        <DeviceLookup />

        {canEdit ? (
          <>
            <div className="devices-header-row">
              <h2>Overrides</h2>
              <div className="devices-header-actions">
                <button
                  className="devices-button-secondary"
                  onClick={() => {
                    setShowBulkImport(v => !v)
                    setShowAddEntry(false)
                  }}
                >
                  {showBulkImport ? 'Cancel bulk import' : 'Bulk import'}
                </button>
                <button
                  className="devices-button-primary"
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
                onSaved={handleEntrySaved}
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
        ) : (
          <div className="devices-warning">
            Sign in with an allowed wallet to view and manage the override list.
          </div>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog state={confirm} onConfirm={handleConfirmAction} onCancel={handleCloseConfirm} />
      )}
    </div>
  )
}

const DeviceLookup: FC = () => {
  const [soc, setSoc] = useState('')
  const [result, setResult] = useState<{ soc: string; decision: PublicDeviceDecision } | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheck = async () => {
    const trimmed = soc.trim()
    if (!trimmed) return
    setChecking(true)
    setError(null)
    setResult(null)
    try {
      const decision = await fetchDeviceDecision(trimmed)
      setResult({ soc: trimmed, decision })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check device')
    } finally {
      setChecking(false)
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
          maxLength={64}
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
        {entry.updatedBy && (
          <span className="device-row-audit">Updated by {shortAddress(entry.updatedBy)}</span>
        )}
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
  onSaved: (entry: DeviceSupportEntry) => void
  onCancel: () => void
}> = ({ authenticatedFetch, onSaved, onCancel }) => {
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

    setSaving(true)
    setError(null)
    try {
      const entry = await upsertDeviceSupport(authenticatedFetch, trimmed, decision)
      onSaved(entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save device support entry')
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
          maxLength={64}
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
  const [error, setError] = useState<string | null>(null)

  const handlePreview = () => {
    const { entries, errors } = parseBulkInput(text)
    if (errors.length > 0) {
      setError(errors[0])
      return
    }
    if (entries.length === 0) {
      setError('Paste at least one "soc,decision" line')
      return
    }
    setError(null)
    onParsed(entries)
  }

  return (
    <section className="device-create-form">
      <h2>Bulk import</h2>
      <p className="device-bulk-hint">
        One entry per line: <code>SOC,decision</code> (comma or tab separated) — decision is{' '}
        <code>exclude</code> or <code>below-minspec</code>. Lines starting with <code>#</code> are
        ignored.
      </p>
      <textarea
        aria-label="Bulk import entries"
        value={text}
        rows={8}
        placeholder={'EXYNOS 7420,exclude\nSM6115,below-minspec'}
        onChange={e => setText(e.target.value)}
      />
      {error && <div className="devices-error">{error}</div>}
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
              ? 'This will add or update every entry below in one batch.'
              : 'This will change what the app decides for this chipset immediately.'}
        </p>

        {action.kind === 'upsert' && (
          <div className="devices-diff">
            <code>{action.soc}</code>
            <span className="devices-diff-value">
              <span className="devices-diff-from">{decisionLabel(action.from)}</span>
              <span className="devices-diff-arrow">→</span>
              <span className="devices-diff-to">{decisionLabel(action.next)}</span>
            </span>
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
            <p className="devices-bulk-count">{action.entries.length} entries</p>
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
