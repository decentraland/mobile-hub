import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import { fetchFeatureFlags, updateFeatureFlags, type FeatureFlags } from '../features/flags/api'
import './FeatureFlagsPage.css'

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; name: string; next: boolean }
  | { status: 'saving'; name: string; next: boolean }
  | { status: 'error'; name: string; next: boolean; message: string }

// Known flags get a human description; new flags served by the BFF still render (name only)
const FLAG_DESCRIPTIONS: Record<string, string> = {
  pulse: 'Enable the ENet/UDP avatar-relay transport (Pulse) in godot-explorer.',
  'dual-channel': 'Keep sending movement over LiveKit while Pulse is established.',
}

export const FeatureFlagsPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })

  const loadFlags = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await fetchFeatureFlags()
      setFlags(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load feature flags')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFlags()
  }, [loadFlags])

  const handleToggle = (name: string) => {
    if (!flags) return
    setConfirm({ status: 'confirming', name, next: !flags[name] })
  }

  const handleConfirmSave = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { name, next } = confirm
    setConfirm({ status: 'saving', name, next })
    try {
      const updated = await updateFeatureFlags(authenticatedFetch, { [name]: next })
      setFlags(updated)
      setConfirm({ status: 'idle' })
    } catch (err) {
      setConfirm({
        status: 'error',
        name,
        next,
        message: err instanceof Error ? err.message : 'Failed to save',
      })
    }
  }

  const handleCloseConfirm = () => {
    setConfirm({ status: 'idle' })
  }

  return (
    <div className="flags-page">
      <div className="flags-container">
        <header className="flags-header">
          <h1>Feature Flags</h1>
          <p>
            Runtime toggles served by <code>GET /feature-flags</code>. Flag names match the
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

        {flags && (
          <div className="flags-list">
            {Object.entries(flags).map(([name, enabled]) => (
              <FlagRow
                key={name}
                name={name}
                enabled={enabled}
                disabled={!canEdit}
                onToggle={() => handleToggle(name)}
              />
            ))}
          </div>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog
          state={confirm}
          onConfirm={handleConfirmSave}
          onCancel={handleCloseConfirm}
        />
      )}
    </div>
  )
}

const FlagRow: FC<{
  name: string
  enabled: boolean
  disabled: boolean
  onToggle: () => void
}> = ({ name, enabled, disabled, onToggle }) => (
  <section className="flag-row">
    <div className="flag-row-labels">
      <span className="flag-row-name">{name}</span>
      {FLAG_DESCRIPTIONS[name] && (
        <span className="flag-row-hint">{FLAG_DESCRIPTIONS[name]}</span>
      )}
    </div>
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={`Toggle ${name}`}
      className={`flag-switch ${enabled ? 'flag-switch-on' : ''}`}
      disabled={disabled}
      title={disabled ? 'Sign in to edit' : `Turn ${name} ${enabled ? 'off' : 'on'}`}
      onClick={onToggle}
    >
      <span className="flag-switch-state">{enabled ? 'ON' : 'OFF'}</span>
      <span className="flag-switch-knob" />
    </button>
  </section>
)

const ConfirmDialog: FC<{
  state: Exclude<ConfirmState, { status: 'idle' }>
  onConfirm: () => void
  onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
  const { name, next } = state
  const saving = state.status === 'saving'
  const errorMessage = state.status === 'error' ? state.message : null

  return (
    <div className="flags-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div className="flags-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>Confirm flag change</h3>
        <p>This will update production behavior immediately.</p>

        <div className="flags-diff">
          <code>{name}</code>
          <span className="flags-diff-value">
            <span className="flags-diff-from">{next ? 'OFF' : 'ON'}</span>
            <span className="flags-diff-arrow">→</span>
            <span className="flags-diff-to">{next ? 'ON' : 'OFF'}</span>
          </span>
        </div>

        {errorMessage && <div className="flags-error">{errorMessage}</div>}

        <div className="flags-modal-actions">
          <button className="flags-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="flags-button-primary" onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Yes, save'}
          </button>
        </div>
      </div>
    </div>
  )
}
