import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type Campaign,
  type CampaignInput,
} from '../features/campaigns/api'
import {
  draftToInput,
  emptyDraft,
  describeTarget,
  type CampaignFormDraft,
} from '../features/campaigns/validation'
import './CampaignsPage.css'

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; token: string }
  | { status: 'saving'; token: string }
  | { status: 'error'; token: string; message: string }

function draftFromCampaign(campaign: Campaign): CampaignFormDraft {
  return {
    token: campaign.token,
    targetType: campaign.target.type,
    targetPosition: campaign.target.type === 'genesis' ? campaign.target.position : '',
    targetWorld: campaign.target.type === 'world' ? campaign.target.name : '',
  }
}

export const CampaignsPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })
  const [editingToken, setEditingToken] = useState<string | null>(null)
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
    loadCampaigns()
  }, [loadCampaigns])

  const replaceCampaign = (updated: Campaign) => {
    setCampaigns(prev => (prev ? prev.map(c => (c.token === updated.token ? updated : c)) : prev))
  }

  const handleConfirmDelete = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { token } = confirm
    setConfirm({ status: 'saving', token })
    try {
      await deleteCampaign(authenticatedFetch, token)
      setCampaigns(prev => (prev ? prev.filter(c => c.token !== token) : prev))
      setConfirm({ status: 'idle' })
    } catch (err) {
      setConfirm({
        status: 'error',
        token,
        message: err instanceof Error ? err.message : 'Failed to delete',
      })
    }
  }

  return (
    <div className="campaigns-page">
      <div className="campaigns-container">
        <header className="campaigns-header">
          <div className="campaigns-header-row">
            <h1>Ad Campaigns</h1>
            {!showCreate && (
              <button className="campaigns-button-primary" onClick={() => setShowCreate(true)}>
                New campaign
              </button>
            )}
          </div>
          <p>
            Maps the opaque token an ad or referrer link carries as <code>?c=&lt;token&gt;</code>{' '}
            to the scene it should open. The explorer reads <code>GET /campaigns</code> on
            boot and takes an attributed install straight into that scene, skipping the FTUE.
            Anything that does not resolve gets the default FTUE, unchanged.
          </p>
          <p className="campaigns-note">
            Changes are live on the next app launch — no release needed. A campaign is live
            as soon as it exists; to stop one, delete it.
          </p>
        </header>

        {isLoading && <div className="campaigns-loading">Loading…</div>}
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
                    updateCampaign(authenticatedFetch, campaign.token, {
                      targetType: input.targetType,
                      targetPosition: input.targetPosition,
                      targetWorld: input.targetWorld,
                    })
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
                  onEdit={() => setEditingToken(campaign.token)}
                  onRequestDelete={() =>
                    setConfirm({ status: 'confirming', token: campaign.token })
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
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirm({ status: 'idle' })}
        />
      )}
    </div>
  )
}

const CampaignRow: FC<{
  campaign: Campaign
  onEdit: () => void
  onRequestDelete: () => void
}> = ({ campaign, onEdit, onRequestDelete }) => (
  <section className="campaign-row">
    <div className="campaign-row-main">
      <div className="campaign-row-labels">
        <span className="campaign-row-token">{campaign.token}</span>
        <span className="campaign-row-target">
          → {campaign.target.type === 'world' ? 'World' : 'Parcel'}{' '}
          <code>{describeTarget(campaign.target)}</code>
        </span>
      </div>
      <div className="campaign-row-actions">
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
      </div>
    </div>
  </section>
)

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
          placeholder="summer2022"
          onChange={e => set('token', e.target.value)}
        />
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
  const saving = state.status === 'saving'
  const errorMessage = state.status === 'error' ? state.message : null

  return (
    <div className="campaigns-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div
        className="campaigns-modal"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <h3>Delete campaign</h3>
        <p>
          This removes the mapping. Installs carrying this token fall back to the default
          FTUE on their next launch.
        </p>

        <div className="campaigns-diff">
          <code>{state.token}</code>
          <span className="campaigns-diff-value campaigns-diff-delete">will be removed</span>
        </div>

        {errorMessage && <div className="campaigns-error">{errorMessage}</div>}

        <div className="campaigns-modal-actions">
          <button className="campaigns-button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="campaigns-button-danger" onClick={onConfirm} disabled={saving}>
            {saving ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
