import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
  fetchFeatureFlags,
  fetchFeatureFlagsDetailed,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  type FeatureFlag,
  type FlagType,
} from '../features/flags/api'
import './FeatureFlagsPage.css'

const FLAG_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Mirrors the BFF validation: plain decimals only, no scientific notation
const NUMBER_VALUE_REGEX = /^-?\d+(\.\d+)?$/

type ConfirmAction =
  | { kind: 'toggle'; name: string; next: boolean }
  | { kind: 'set-value'; name: string; from: string; next: string }
  | { kind: 'delete'; name: string }

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; action: ConfirmAction }
  | { status: 'saving'; action: ConfirmAction }
  | { status: 'error'; action: ConfirmAction; message: string }

function sortByName(flags: FeatureFlag[]): FeatureFlag[] {
  return [...flags].sort((a, b) => a.name.localeCompare(b.name))
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function publicValueToFlag(name: string, value: boolean | string | number): FeatureFlag {
  const type: FlagType = typeof value === 'boolean' ? 'on-off' : typeof value === 'number' ? 'number' : 'text'
  return {
    name,
    type,
    enabled: value === true,
    value: typeof value === 'boolean' ? null : value,
    description: null,
    updatedAt: '',
    updatedBy: null,
  }
}

export const FeatureFlagsPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [flags, setFlags] = useState<FeatureFlag[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editingValueName, setEditingValueName] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadFlags = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      if (canEdit) {
        setFlags(sortByName(await fetchFeatureFlagsDetailed(authenticatedFetch)))
      } else {
        const map = await fetchFeatureFlags()
        setFlags(sortByName(Object.entries(map).map(([name, value]) => publicValueToFlag(name, value))))
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load feature flags')
    } finally {
      setIsLoading(false)
    }
  }, [canEdit, authenticatedFetch])

  useEffect(() => {
    loadFlags()
  }, [loadFlags])

  const replaceFlag = (updated: FeatureFlag) => {
    setFlags(prev => (prev ? prev.map(f => (f.name === updated.name ? updated : f)) : prev))
  }

  const handleToggle = (flag: FeatureFlag) => {
    setConfirm({ status: 'confirming', action: { kind: 'toggle', name: flag.name, next: !flag.enabled } })
  }

  const handleRequestSetValue = (flag: FeatureFlag, next: string) => {
    setConfirm({
      status: 'confirming',
      action: { kind: 'set-value', name: flag.name, from: String(flag.value ?? ''), next },
    })
  }

  const handleRequestDelete = (flag: FeatureFlag) => {
    setConfirm({ status: 'confirming', action: { kind: 'delete', name: flag.name } })
  }

  const handleConfirmAction = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { action } = confirm
    setConfirm({ status: 'saving', action })
    try {
      if (action.kind === 'toggle') {
        const updated = await updateFeatureFlag(authenticatedFetch, action.name, { enabled: action.next })
        replaceFlag(updated)
      } else if (action.kind === 'set-value') {
        const updated = await updateFeatureFlag(authenticatedFetch, action.name, { value: action.next })
        replaceFlag(updated)
        setEditingValueName(null)
      } else {
        await deleteFeatureFlag(authenticatedFetch, action.name)
        setFlags(prev => (prev ? prev.filter(f => f.name !== action.name) : prev))
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

  const handleDescriptionSaved = (updated: FeatureFlag) => {
    replaceFlag(updated)
    setEditingName(null)
  }

  const handleCreated = (created: FeatureFlag) => {
    setFlags(prev => sortByName([...(prev ?? []), created]))
    setShowCreate(false)
  }

  return (
    <div className="flags-page">
      <div className="flags-container">
        <header className="flags-header">
          <div className="flags-header-row">
            <h1>Feature Flags</h1>
            {canEdit && !showCreate && (
              <button className="flags-button-primary" onClick={() => setShowCreate(true)}>
                New flag
              </button>
            )}
          </div>
          <p>
            Runtime flags served by <code>GET /feature-flags</code>: on/off toggles, plus text
            and number fields (e.g. <code>sentry-sample-rate</code>). Flag names match the
            godot-explorer deep-link params (e.g. <code>pulse</code>,{' '}
            <code>dual-channel</code>).
          </p>
          {!canEdit && (
            <div className="flags-warning">
              Sign in with an allowed wallet to edit feature flags.
            </div>
          )}
        </header>

        {isLoading && <div className="flags-loading">Loading…</div>}
        {loadError && (
          <div className="flags-error">
            {loadError}{' '}
            <button className="flags-link-button" onClick={loadFlags}>
              Retry
            </button>
          </div>
        )}

        {showCreate && (
          <CreateFlagForm
            authenticatedFetch={authenticatedFetch}
            onCreated={handleCreated}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {flags && (
          <div className="flags-list">
            {flags.map(flag => (
              <FlagRow
                key={flag.name}
                flag={flag}
                canEdit={canEdit}
                isEditingDescription={editingName === flag.name}
                isEditingValue={editingValueName === flag.name}
                authenticatedFetch={authenticatedFetch}
                onToggle={() => handleToggle(flag)}
                onStartEditValue={() => setEditingValueName(flag.name)}
                onCancelEditValue={() => setEditingValueName(null)}
                onRequestSetValue={next => handleRequestSetValue(flag, next)}
                onStartEditDescription={() => setEditingName(flag.name)}
                onCancelEditDescription={() => setEditingName(null)}
                onDescriptionSaved={handleDescriptionSaved}
                onRequestDelete={() => handleRequestDelete(flag)}
              />
            ))}
          </div>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog
          state={confirm}
          onConfirm={handleConfirmAction}
          onCancel={handleCloseConfirm}
        />
      )}
    </div>
  )
}

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

const FlagRow: FC<{
  flag: FeatureFlag
  canEdit: boolean
  isEditingDescription: boolean
  isEditingValue: boolean
  authenticatedFetch: AuthenticatedFetch
  onToggle: () => void
  onStartEditValue: () => void
  onCancelEditValue: () => void
  onRequestSetValue: (next: string) => void
  onStartEditDescription: () => void
  onCancelEditDescription: () => void
  onDescriptionSaved: (updated: FeatureFlag) => void
  onRequestDelete: () => void
}> = ({
  flag,
  canEdit,
  isEditingDescription,
  isEditingValue,
  authenticatedFetch,
  onToggle,
  onStartEditValue,
  onCancelEditValue,
  onRequestSetValue,
  onStartEditDescription,
  onCancelEditDescription,
  onDescriptionSaved,
  onRequestDelete,
}) => (
  <section className="flag-row">
    <div className="flag-row-main">
      <div className="flag-row-labels">
        <span className="flag-row-name">
          {flag.name}
          {flag.type !== 'on-off' && <span className="flag-type-badge">{flag.type}</span>}
        </span>
        {!isEditingDescription && flag.description && (
          <span className="flag-row-hint">{flag.description}</span>
        )}
        {flag.updatedBy && (
          <span className="flag-row-audit">
            Updated by {shortAddress(flag.updatedBy)}
          </span>
        )}
      </div>
      <div className="flag-row-actions">
        {canEdit && !isEditingDescription && (
          <>
            <button
              className="flag-icon-button"
              aria-label={`Edit ${flag.name} description`}
              title="Edit description"
              onClick={onStartEditDescription}
            >
              ✎
            </button>
            <button
              className="flag-icon-button flag-icon-button-danger"
              aria-label={`Delete ${flag.name}`}
              title="Delete flag"
              onClick={onRequestDelete}
            >
              ✕
            </button>
          </>
        )}
        {flag.type === 'on-off' ? (
          <button
            role="switch"
            aria-checked={flag.enabled}
            aria-label={`Toggle ${flag.name}`}
            className={`flag-switch ${flag.enabled ? 'flag-switch-on' : ''}`}
            disabled={!canEdit}
            title={canEdit ? `Turn ${flag.name} ${flag.enabled ? 'off' : 'on'}` : 'Sign in to edit'}
            onClick={onToggle}
          >
            <span className="flag-switch-state">{flag.enabled ? 'ON' : 'OFF'}</span>
            <span className="flag-switch-knob" />
          </button>
        ) : (
          <button
            className="flag-value-chip"
            aria-label={`Edit ${flag.name} value`}
            disabled={!canEdit || isEditingValue}
            title={canEdit ? `Edit ${flag.name} value` : 'Sign in to edit'}
            onClick={onStartEditValue}
          >
            {String(flag.value ?? '')}
          </button>
        )}
      </div>
    </div>

    {isEditingValue && (
      <ValueEditor flag={flag} onSubmit={onRequestSetValue} onCancel={onCancelEditValue} />
    )}

    {isEditingDescription && (
      <DescriptionEditor
        flag={flag}
        authenticatedFetch={authenticatedFetch}
        onSaved={onDescriptionSaved}
        onCancel={onCancelEditDescription}
      />
    )}
  </section>
)

const ValueEditor: FC<{
  flag: FeatureFlag
  onSubmit: (next: string) => void
  onCancel: () => void
}> = ({ flag, onSubmit, onCancel }) => {
  const [draft, setDraft] = useState(String(flag.value ?? ''))
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (flag.type === 'number' && !NUMBER_VALUE_REGEX.test(draft.trim())) {
      setError('Value must be a plain decimal number (e.g. 1, 0.1)')
      return
    }
    setError(null)
    onSubmit(flag.type === 'number' ? draft.trim() : draft)
  }

  return (
    <div className="flag-value-editor">
      <input
        aria-label={`Value for ${flag.name}`}
        value={draft}
        maxLength={500}
        inputMode={flag.type === 'number' ? 'decimal' : 'text'}
        placeholder={flag.type === 'number' ? '0.1' : 'Value served to clients'}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      {error && <div className="flags-error">{error}</div>}
      <div className="flag-value-editor-actions">
        <button className="flags-button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="flags-button-primary" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  )
}

const DescriptionEditor: FC<{
  flag: FeatureFlag
  authenticatedFetch: AuthenticatedFetch
  onSaved: (updated: FeatureFlag) => void
  onCancel: () => void
}> = ({ flag, authenticatedFetch, onSaved, onCancel }) => {
  const [draft, setDraft] = useState(flag.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const trimmed = draft.trim()
      const updated = await updateFeatureFlag(authenticatedFetch, flag.name, {
        description: trimmed.length > 0 ? trimmed : null,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save description')
      setSaving(false)
    }
  }

  return (
    <div className="flag-description-editor">
      <textarea
        aria-label={`Description for ${flag.name}`}
        value={draft}
        maxLength={500}
        rows={2}
        placeholder="What does this flag do?"
        onChange={e => setDraft(e.target.value)}
      />
      {error && <div className="flags-error">{error}</div>}
      <div className="flag-description-editor-actions">
        <button className="flags-button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="flags-button-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const CreateFlagForm: FC<{
  authenticatedFetch: AuthenticatedFetch
  onCreated: (created: FeatureFlag) => void
  onCancel: () => void
}> = ({ authenticatedFetch, onCreated, onCancel }) => {
  const [name, setName] = useState('')
  const [type, setType] = useState<FlagType>('on-off')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!FLAG_NAME_REGEX.test(trimmedName)) {
      setError(
        "Name must be kebab-case (lowercase letters, digits and dashes, e.g. 'dual-channel')"
      )
      return
    }
    if (type === 'number' && !NUMBER_VALUE_REGEX.test(value.trim())) {
      setError('Value must be a plain decimal number (e.g. 1, 0.1)')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const trimmedDescription = description.trim()
      const created = await createFeatureFlag(authenticatedFetch, {
        name: trimmedName,
        type,
        ...(type === 'on-off'
          ? { enabled }
          : { value: type === 'number' ? value.trim() : value }),
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feature flag')
      setSaving(false)
    }
  }

  return (
    <section className="flag-create-form">
      <h2>New feature flag</h2>
      <label className="flag-create-field">
        <span>Name</span>
        <input
          aria-label="Flag name"
          value={name}
          maxLength={64}
          placeholder="my-new-flag"
          onChange={e => setName(e.target.value)}
        />
      </label>
      <label className="flag-create-field">
        <span>Type</span>
        <select
          aria-label="Flag type"
          value={type}
          onChange={e => setType(e.target.value as FlagType)}
        >
          <option value="on-off">ON/OFF</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
      </label>
      <label className="flag-create-field">
        <span>Description</span>
        <textarea
          aria-label="Flag description"
          value={description}
          maxLength={500}
          rows={2}
          placeholder="What does this flag do?"
          onChange={e => setDescription(e.target.value)}
        />
      </label>
      {type === 'on-off' ? (
        <label className="flag-create-enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
          />
          <span>Enabled from the start</span>
        </label>
      ) : (
        <label className="flag-create-field">
          <span>Value</span>
          <input
            aria-label="Flag value"
            value={value}
            maxLength={500}
            inputMode={type === 'number' ? 'decimal' : 'text'}
            placeholder={type === 'number' ? '0.1' : 'Value served to clients'}
            onChange={e => setValue(e.target.value)}
          />
        </label>
      )}
      {error && <div className="flags-error">{error}</div>}
      <div className="flag-create-actions">
        <button className="flags-button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="flags-button-primary" onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating…' : 'Create flag'}
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

  return (
    <div className="flags-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div className="flags-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>{isDelete ? 'Delete feature flag' : 'Confirm flag change'}</h3>
        <p>
          {isDelete
            ? 'This permanently removes the flag. Clients reading it will fall back to their built-in defaults.'
            : 'This will update production behavior immediately.'}
        </p>

        <div className="flags-diff">
          <code>{action.name}</code>
          {action.kind === 'toggle' ? (
            <span className="flags-diff-value">
              <span className="flags-diff-from">{action.next ? 'OFF' : 'ON'}</span>
              <span className="flags-diff-arrow">→</span>
              <span className="flags-diff-to">{action.next ? 'ON' : 'OFF'}</span>
            </span>
          ) : action.kind === 'set-value' ? (
            <span className="flags-diff-value">
              <span className="flags-diff-from">{action.from}</span>
              <span className="flags-diff-arrow">→</span>
              <span className="flags-diff-to">{action.next}</span>
            </span>
          ) : (
            <span className="flags-diff-value flags-diff-delete">will be removed</span>
          )}
        </div>

        {errorMessage && <div className="flags-error">{errorMessage}</div>}

        <div className="flags-modal-actions">
          <button className="flags-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className={isDelete ? 'flags-button-danger' : 'flags-button-primary'}
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? (isDelete ? 'Deleting…' : 'Saving…') : isDelete ? 'Yes, delete' : 'Yes, save'}
          </button>
        </div>
      </div>
    </div>
  )
}
