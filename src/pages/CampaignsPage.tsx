import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  fetchCampaignAudit,
  type Campaign,
  type CampaignAuditEntry,
  type CampaignInput,
  type CampaignChanges,
} from '../features/campaigns/api'
import {
  draftToInput,
  emptyDraft,
  describeTarget,
  windowState,
  type CampaignFormDraft,
} from '../features/campaigns/validation'
import './CampaignsPage.css'

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

type ConfirmAction =
  | { kind: 'toggle'; token: string; next: boolean }
  | { kind: 'delete'; token: string }

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; action: ConfirmAction }
  | { status: 'saving'; action: ConfirmAction }
  | { status: 'error'; action: ConfirmAction; message: string }

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

// The token is the identity, not a field, so an edit sends everything except it. Keys left
// undefined (the target column that does not apply) are dropped by JSON.stringify.
function toChanges(input: CampaignInput): CampaignChanges {
  return {
    mode: input.mode,
    targetType: input.targetType,
    targetPosition: input.targetPosition,
    targetWorld: input.targetWorld,
    title: input.title,
    cta: input.cta,
    placeIds: input.placeIds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    enabled: input.enabled,
  }
}

function draftFromCampaign(campaign: Campaign): CampaignFormDraft {
  const toLocalInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '')
  return {
    token: campaign.token,
    mode: campaign.mode,
    targetType: campaign.target.type,
    targetPosition: campaign.target.type === 'genesis' ? campaign.target.position : '',
    targetWorld: campaign.target.type === 'world' ? campaign.target.name : '',
    title: campaign.title ?? '',
    cta: campaign.cta ?? '',
    placeIds: campaign.placeIds.join(', '),
    startsAt: toLocalInput(campaign.startsAt),
    endsAt: toLocalInput(campaign.endsAt),
    enabled: campaign.enabled,
  }
}

export const CampaignsPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  const [editingToken, setEditingToken] = useState<string | null>(null)
  const [auditToken, setAuditToken] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setCampaigns(await fetchCampaigns(authenticatedFetch))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load campaigns')
    } finally {
      setIsLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    if (!canEdit) {
      setIsLoading(false)
      return
    }
    loadCampaigns()
  }, [canEdit, loadCampaigns])

  const replaceCampaign = (updated: Campaign) => {
    setCampaigns(prev => (prev ? prev.map(c => (c.token === updated.token ? updated : c)) : prev))
  }

  const handleConfirmAction = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { action } = confirm
    setConfirm({ status: 'saving', action })
    try {
      if (action.kind === 'toggle') {
        replaceCampaign(await updateCampaign(authenticatedFetch, action.token, { enabled: action.next }))
      } else {
        await deleteCampaign(authenticatedFetch, action.token)
        setCampaigns(prev => (prev ? prev.filter(c => c.token !== action.token) : prev))
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

  return (
    <div className="campaigns-page">
      <div className="campaigns-container">
        <header className="campaigns-header">
          <div className="campaigns-header-row">
            <h1>Ad Campaigns</h1>
            {canEdit && !showCreate && (
              <button className="campaigns-button-primary" onClick={() => setShowCreate(true)}>
                New campaign
              </button>
            )}
          </div>
          <p>
            Maps the opaque token an ad or referrer link carries as <code>?c=&lt;token&gt;</code>{' '}
            to the scene it should open. The explorer reads{' '}
            <code>GET /campaigns</code> on boot and either personalizes the FTUE
            (<code>ftue</code>) or boots straight into the target (<code>bypass</code>).
            Anything that does not resolve falls back to the default FTUE.
          </p>
          <p className="campaigns-note">
            Changes are live on the next app launch — no release needed. A campaign only
            reaches clients while it is enabled and inside its active window.
          </p>
          {!canEdit && (
            <div className="campaigns-warning">
              Sign in with an allowed wallet to manage campaigns.
            </div>
          )}
        </header>

        {isLoading && canEdit && <div className="campaigns-loading">Loading…</div>}
        {loadError && (
          <div className="campaigns-error">
            {loadError}{' '}
            <button className="campaigns-link-button" onClick={loadCampaigns}>
              Retry
            </button>
          </div>
        )}

        {showCreate && (
          <CampaignForm
            heading="New campaign"
            submitLabel="Create campaign"
            initialDraft={emptyDraft()}
            tokenLocked={false}
            onSubmit={input => createCampaign(authenticatedFetch, input)}
            onSaved={created => {
              setCampaigns(prev => [created, ...(prev ?? [])])
              setShowCreate(false)
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {campaigns && campaigns.length === 0 && !showCreate && (
          <div className="campaigns-empty">
            No campaigns yet. Create one, then point an ad group's App URL at{' '}
            <code>https://mobile.dclexplorer.com/open?c=&lt;token&gt;</code>.
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <div className="campaigns-list">
            {campaigns.map(campaign =>
              editingToken === campaign.token ? (
                <CampaignForm
                  key={campaign.token}
                  heading={`Edit ${campaign.token}`}
                  submitLabel="Save changes"
                  initialDraft={draftFromCampaign(campaign)}
                  tokenLocked
                  onSubmit={input =>
                    updateCampaign(authenticatedFetch, campaign.token, toChanges(input))
                  }
                  onSaved={updated => {
                    replaceCampaign(updated)
                    setEditingToken(null)
                  }}
                  onCancel={() => setEditingToken(null)}
                />
              ) : (
                <CampaignRow
                  key={campaign.token}
                  campaign={campaign}
                  canEdit={canEdit}
                  authenticatedFetch={authenticatedFetch}
                  isAuditOpen={auditToken === campaign.token}
                  onToggleAudit={() =>
                    setAuditToken(auditToken === campaign.token ? null : campaign.token)
                  }
                  onEdit={() => setEditingToken(campaign.token)}
                  onToggle={() =>
                    setConfirm({
                      status: 'confirming',
                      action: { kind: 'toggle', token: campaign.token, next: !campaign.enabled },
                    })
                  }
                  onRequestDelete={() =>
                    setConfirm({
                      status: 'confirming',
                      action: { kind: 'delete', token: campaign.token },
                    })
                  }
                />
              )
            )}
          </div>
        )}
      </div>

      {confirm.status !== 'idle' && (
        <ConfirmDialog
          state={confirm}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirm({ status: 'idle' })}
        />
      )}
    </div>
  )
}

const STATE_LABEL: Record<ReturnType<typeof windowState>, string> = {
  live: 'LIVE',
  scheduled: 'SCHEDULED',
  expired: 'EXPIRED',
  disabled: 'OFF',
}

const CampaignRow: FC<{
  campaign: Campaign
  canEdit: boolean
  authenticatedFetch: AuthenticatedFetch
  isAuditOpen: boolean
  onToggleAudit: () => void
  onEdit: () => void
  onToggle: () => void
  onRequestDelete: () => void
}> = ({
  campaign,
  canEdit,
  authenticatedFetch,
  isAuditOpen,
  onToggleAudit,
  onEdit,
  onToggle,
  onRequestDelete,
}) => {
  const state = windowState(campaign)

  return (
    <section className="campaign-row">
      <div className="campaign-row-main">
        <div className="campaign-row-labels">
          <span className="campaign-row-token">
            {campaign.token}
            <span className={`campaign-badge campaign-badge-${campaign.mode}`}>{campaign.mode}</span>
            <span className={`campaign-state campaign-state-${state}`}>{STATE_LABEL[state]}</span>
          </span>
          <span className="campaign-row-target">
            → {campaign.target.type === 'world' ? 'World' : 'Parcel'}{' '}
            <code>{describeTarget(campaign.target)}</code>
          </span>
          <span className="campaign-row-window">
            {formatDate(campaign.startsAt)} → {formatDate(campaign.endsAt)}
          </span>
          {campaign.updatedBy && (
            <span className="campaign-row-audit-line">
              Updated by {shortAddress(campaign.updatedBy)} · {formatDate(campaign.updatedAt)}
            </span>
          )}
        </div>
        <div className="campaign-row-actions">
          {canEdit && (
            <>
              <button
                className="campaign-icon-button"
                aria-label={`History for ${campaign.token}`}
                title="Audit trail"
                onClick={onToggleAudit}
              >
                ⟲
              </button>
              <button
                className="campaign-icon-button"
                aria-label={`Edit ${campaign.token}`}
                title="Edit campaign"
                onClick={onEdit}
              >
                ✎
              </button>
              <button
                className="campaign-icon-button campaign-icon-button-danger"
                aria-label={`Delete ${campaign.token}`}
                title="Delete campaign"
                onClick={onRequestDelete}
              >
                ✕
              </button>
            </>
          )}
          <button
            role="switch"
            aria-checked={campaign.enabled}
            aria-label={`Toggle ${campaign.token}`}
            className={`campaign-switch ${campaign.enabled ? 'campaign-switch-on' : ''}`}
            disabled={!canEdit}
            onClick={onToggle}
          >
            <span className="campaign-switch-state">{campaign.enabled ? 'ON' : 'OFF'}</span>
            <span className="campaign-switch-knob" />
          </button>
        </div>
      </div>

      {isAuditOpen && (
        <AuditTrail token={campaign.token} authenticatedFetch={authenticatedFetch} />
      )}
    </section>
  )
}

const AuditTrail: FC<{ token: string; authenticatedFetch: AuthenticatedFetch }> = ({
  token,
  authenticatedFetch,
}) => {
  const [entries, setEntries] = useState<CampaignAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCampaignAudit(authenticatedFetch, token)
      .then(loaded => {
        if (!cancelled) setEntries(loaded)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the audit trail')
      })
    return () => {
      cancelled = true
    }
  }, [token, authenticatedFetch])

  if (error) return <div className="campaigns-error">{error}</div>
  if (!entries) return <div className="campaign-audit-loading">Loading history…</div>
  if (entries.length === 0) return <div className="campaign-audit-loading">No history yet.</div>

  return (
    <ul className="campaign-audit">
      {entries.map(entry => (
        <li key={entry.id}>
          <span className={`campaign-audit-action campaign-audit-${entry.action}`}>
            {entry.action}
          </span>
          <span className="campaign-audit-actor">{shortAddress(entry.actor)}</span>
          <span className="campaign-audit-date">{formatDate(entry.createdAt)}</span>
          {entry.changes && (
            <code className="campaign-audit-changes">{Object.keys(entry.changes).join(', ')}</code>
          )}
        </li>
      ))}
    </ul>
  )
}

const CampaignForm: FC<{
  heading: string
  submitLabel: string
  initialDraft: CampaignFormDraft
  tokenLocked: boolean
  onSubmit: (input: CampaignInput) => Promise<Campaign>
  onSaved: (campaign: Campaign) => void
  onCancel: () => void
}> = ({ heading, submitLabel, initialDraft, tokenLocked, onSubmit, onSaved, onCancel }) => {
  const [draft, setDraft] = useState<CampaignFormDraft>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof CampaignFormDraft>(key: K, value: CampaignFormDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    const parsed = draftToInput(draft)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      onSaved(await onSubmit(parsed.input))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save campaign')
      setSaving(false)
    }
  }

  return (
    <section className="campaign-form">
      <h2>{heading}</h2>

      <label className="campaign-field">
        <span>Token</span>
        <input
          aria-label="Campaign token"
          value={draft.token}
          maxLength={64}
          disabled={tokenLocked}
          placeholder="summer-26"
          onChange={e => set('token', e.target.value)}
        />
      </label>

      <label className="campaign-field">
        <span>Mode</span>
        <select
          aria-label="Campaign mode"
          value={draft.mode}
          onChange={e => set('mode', e.target.value as CampaignFormDraft['mode'])}
        >
          <option value="ftue">Personalized FTUE</option>
          <option value="bypass">Boot straight into the scene</option>
        </select>
      </label>

      <label className="campaign-field">
        <span>Target</span>
        <select
          aria-label="Target type"
          value={draft.targetType}
          onChange={e => set('targetType', e.target.value as CampaignFormDraft['targetType'])}
        >
          <option value="genesis">Genesis parcel</option>
          <option value="world">World</option>
        </select>
      </label>

      {draft.targetType === 'genesis' ? (
        <label className="campaign-field">
          <span>Parcel</span>
          <input
            aria-label="Target parcel"
            value={draft.targetPosition}
            placeholder="-9,-9"
            onChange={e => set('targetPosition', e.target.value)}
          />
        </label>
      ) : (
        <label className="campaign-field">
          <span>World</span>
          <input
            aria-label="Target world"
            value={draft.targetWorld}
            placeholder="myworld.dcl.eth"
            onChange={e => set('targetWorld', e.target.value)}
          />
        </label>
      )}

      {draft.mode === 'ftue' && (
        <>
          <label className="campaign-field">
            <span>FTUE title</span>
            <input
              aria-label="FTUE title"
              value={draft.title}
              maxLength={120}
              placeholder="Summer is here"
              onChange={e => set('title', e.target.value)}
            />
          </label>
          <label className="campaign-field">
            <span>CTA label</span>
            <input
              aria-label="CTA label"
              value={draft.cta}
              maxLength={40}
              placeholder="Jump into Summer"
              onChange={e => set('cta', e.target.value)}
            />
          </label>
          <label className="campaign-field">
            <span>Carousel place ids</span>
            <textarea
              aria-label="Carousel place ids"
              value={draft.placeIds}
              rows={2}
              placeholder="Comma-separated place uuids. Empty uses the default featured list."
              onChange={e => set('placeIds', e.target.value)}
            />
          </label>
        </>
      )}

      <div className="campaign-field-row">
        <label className="campaign-field">
          <span>Starts at</span>
          <input
            type="datetime-local"
            aria-label="Starts at"
            value={draft.startsAt}
            onChange={e => set('startsAt', e.target.value)}
          />
        </label>
        <label className="campaign-field">
          <span>Ends at</span>
          <input
            type="datetime-local"
            aria-label="Ends at"
            value={draft.endsAt}
            onChange={e => set('endsAt', e.target.value)}
          />
        </label>
      </div>

      <label className="campaign-enabled">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={e => set('enabled', e.target.checked)}
        />
        <span>Enabled</span>
      </label>

      {error && <div className="campaigns-error">{error}</div>}

      <div className="campaign-form-actions">
        <button className="campaigns-button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="campaigns-button-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
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
    <div className="campaigns-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="campaigns-modal"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <h3>{isDelete ? 'Delete campaign' : 'Confirm campaign change'}</h3>
        <p>
          {isDelete
            ? 'This removes the mapping. Installs carrying this token fall back to the default FTUE. The audit trail is kept.'
            : 'This changes what new installs see on their next launch.'}
        </p>

        <div className="campaigns-diff">
          <code>{action.token}</code>
          {action.kind === 'toggle' ? (
            <span className="campaigns-diff-value">
              <span className="campaigns-diff-from">{action.next ? 'OFF' : 'ON'}</span>
              <span className="campaigns-diff-arrow">→</span>
              <span className="campaigns-diff-to">{action.next ? 'ON' : 'OFF'}</span>
            </span>
          ) : (
            <span className="campaigns-diff-value campaigns-diff-delete">will be removed</span>
          )}
        </div>

        {errorMessage && <div className="campaigns-error">{errorMessage}</div>}

        <div className="campaigns-modal-actions">
          <button className="campaigns-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className={isDelete ? 'campaigns-button-danger' : 'campaigns-button-primary'}
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? 'Saving…' : isDelete ? 'Yes, delete' : 'Yes, save'}
          </button>
        </div>
      </div>
    </div>
  )
}
