import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
  fetchPushCampaigns,
  createPushCampaign,
  updatePushCampaign,
  uploadPushAudience,
  testSendPushCampaign,
  submitPushCampaign,
  approvePushCampaign,
  cancelPushCampaign,
  fetchPushCampaignStats,
  type PushCampaign,
  type AudienceReport,
  type CampaignStats,
  type TestSendResult,
} from '../features/push/api'
import {
  emptyDraft,
  draftFromCampaign,
  draftToInput,
  draftWarnings,
  validateDraft,
  permissionsFor,
  statusLabel,
  type PushFormDraft,
} from '../features/push/validation'
import { NotificationPreview } from '../features/push/components/NotificationPreview'
import './PushPage.css'

type Busy = { id: string; action: string } | null

export const PushPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn, wallet } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [campaigns, setCampaigns] = useState<PushCampaign[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)

  const [draft, setDraft] = useState<PushFormDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [audienceReport, setAudienceReport] = useState<AudienceReport | null>(null)
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [testResults, setTestResults] = useState<TestSendResult[] | null>(null)
  const [testTokens, setTestTokens] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setCampaigns(await fetchPushCampaigns(authenticatedFetch))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load push campaigns')
    } finally {
      setIsLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    if (!canEdit) {
      setIsLoading(false)
      return
    }
    load()
  }, [canEdit, load])

  const replace = (updated: PushCampaign) =>
    setCampaigns(prev => (prev ? prev.map(c => (c.id === updated.id ? updated : c)) : prev))

  /** Every mutation goes through here so one failure cannot leave the page spinning. */
  async function run<T>(id: string, action: string, work: () => Promise<T>): Promise<T | undefined> {
    setBusy({ id, action })
    setActionError(null)
    try {
      return await work()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action}`)
      return undefined
    } finally {
      setBusy(null)
    }
  }

  const errors = draft ? validateDraft(draft, { isNew: editingId === null }) : {}
  const hasErrors = Object.keys(errors).length > 0

  const handleSave = async () => {
    if (!draft || hasErrors) return
    const input = draftToInput(draft)

    if (editingId) {
      const result = await run(editingId, 'save', () =>
        updatePushCampaign(authenticatedFetch, editingId, {
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          imageUrl: input.imageUrl,
          ttlSeconds: input.ttlSeconds,
          scheduledAt: input.scheduledAt,
        })
      )
      if (result) {
        replace(result.data)
        setDraft(null)
        setEditingId(null)
      }
      return
    }

    const result = await run('new', 'create', () => createPushCampaign(authenticatedFetch, input))
    if (result) {
      setCampaigns(prev => (prev ? [result.data, ...prev] : [result.data]))
      setDraft(null)
      setSelectedId(result.data.id)
    }
  }

  const handleAudienceFile = async (campaign: PushCampaign, file: File) => {
    const csv = await file.text()
    const report = await run(campaign.id, 'upload audience', () =>
      uploadPushAudience(authenticatedFetch, campaign.id, csv)
    )
    if (report) {
      setAudienceReport(report)
      // audience_count changed server-side; reload so submit is gated on the real number.
      await load()
    }
  }

  const openDetail = async (campaign: PushCampaign) => {
    setSelectedId(campaign.id)
    setAudienceReport(null)
    setTestResults(null)
    setStats(null)
    const result = await run(campaign.id, 'load stats', () =>
      fetchPushCampaignStats(authenticatedFetch, campaign.id)
    )
    if (result) {
      setStats(result.stats)
    }
  }

  if (!canEdit) {
    return (
      <div className="push-page">
        <div className="push-container">
          <div className="push-empty">Sign in to manage push campaigns.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="push-page">
      <div className="push-container">
        <header className="push-header">
          <div className="push-header-row">
            <h1>Push Notifications</h1>
            {!draft && (
              <button
                className="push-button-primary"
                onClick={() => {
                  setDraft(emptyDraft())
                  setEditingId(null)
                }}
              >
                New campaign
              </button>
            )}
          </div>
          <p>
            Android only. Devices register through the app; the audience is resolved in the
            warehouse and uploaded here as a <code>user_id,fcm_token</code> CSV.
          </p>
          <p className="push-note">
            A campaign has to be approved by someone other than whoever created it, and nothing
            is sent until it is.
          </p>
        </header>

        {loadError && <div className="push-error">{loadError}</div>}
        {actionError && <div className="push-error">{actionError}</div>}

        {draft && (
          <section className="push-form-section">
            <div className="push-form">
              <h2>{editingId ? 'Edit campaign' : 'New campaign'}</h2>

              {!editingId && (
                <label className="push-field">
                  <span>Campaign key</span>
                  <input
                    value={draft.campaignKey}
                    placeholder="spring-event"
                    onChange={e => setDraft({ ...draft, campaignKey: e.target.value })}
                  />
                  <small>
                    Travels in the deep link and is how analytics joins opens back to this
                    campaign. It cannot be changed later.
                  </small>
                  {errors.campaignKey && <em className="push-field-error">{errors.campaignKey}</em>}
                </label>
              )}

              <label className="push-field">
                <span>Title</span>
                <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                {errors.title && <em className="push-field-error">{errors.title}</em>}
              </label>

              <label className="push-field">
                <span>Body</span>
                <textarea
                  rows={3}
                  value={draft.body}
                  onChange={e => setDraft({ ...draft, body: e.target.value })}
                />
                {errors.body && <em className="push-field-error">{errors.body}</em>}
              </label>

              <label className="push-field">
                <span>Deep link</span>
                <input value={draft.deepLink} onChange={e => setDraft({ ...draft, deepLink: e.target.value })} />
                <small>
                  Tracking params are added automatically when sending — do not write them here.
                </small>
                {errors.deepLink && <em className="push-field-error">{errors.deepLink}</em>}
              </label>

              <label className="push-field">
                <span>Image URL (optional)</span>
                <input value={draft.imageUrl} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} />
                {errors.imageUrl && <em className="push-field-error">{errors.imageUrl}</em>}
              </label>

              <div className="push-field-row">
                <label className="push-field">
                  <span>Expires after (hours)</span>
                  <input
                    value={draft.ttlHours}
                    onChange={e => setDraft({ ...draft, ttlHours: e.target.value })}
                  />
                  <small>After this, undelivered notifications are dropped instead of arriving late.</small>
                  {errors.ttlHours && <em className="push-field-error">{errors.ttlHours}</em>}
                </label>

                <label className="push-field">
                  <span>Send at (optional)</span>
                  <input
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={e => setDraft({ ...draft, scheduledAt: e.target.value })}
                  />
                  <small>Leave empty to send as soon as it is approved.</small>
                  {errors.scheduledAt && <em className="push-field-error">{errors.scheduledAt}</em>}
                </label>
              </div>

              {draftWarnings(draft).map(warning => (
                <div className="push-warning" key={warning}>
                  {warning}
                </div>
              ))}

              <div className="push-form-actions">
                <button className="push-button-primary" onClick={handleSave} disabled={hasErrors || !!busy}>
                  {editingId ? 'Save' : 'Create draft'}
                </button>
                <button
                  className="push-button-secondary"
                  onClick={() => {
                    setDraft(null)
                    setEditingId(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>

            <NotificationPreview title={draft.title} body={draft.body} imageUrl={draft.imageUrl} />
          </section>
        )}

        {isLoading && <div className="push-loading">Loading…</div>}

        {!isLoading && campaigns?.length === 0 && (
          <div className="push-empty">No push campaigns yet.</div>
        )}

        <div className="push-list">
          {campaigns?.map(campaign => {
            const permissions = permissionsFor(campaign, wallet)
            const isSelected = campaign.id === selectedId
            const isBusy = busy?.id === campaign.id

            return (
              <div className={`push-row ${isSelected ? 'push-row-selected' : ''}`} key={campaign.id}>
                <div className="push-row-main" onClick={() => openDetail(campaign)}>
                  <div className="push-row-heading">
                    <code className="push-row-key">{campaign.campaignKey}</code>
                    <span className={`push-status push-status-${campaign.status}`}>
                      {statusLabel(campaign.status)}
                    </span>
                  </div>
                  <div className="push-row-title">{campaign.title}</div>
                  <div className="push-row-meta">
                    {campaign.audienceCount.toLocaleString()} recipients
                    {campaign.scheduledAt && ` · sends ${new Date(campaign.scheduledAt).toLocaleString()}`}
                  </div>
                </div>

                <div className="push-row-actions">
                  {permissions.canEdit && (
                    <button
                      className="push-button-secondary"
                      onClick={() => {
                        setDraft(draftFromCampaign(campaign))
                        setEditingId(campaign.id)
                      }}
                    >
                      Edit
                    </button>
                  )}

                  {permissions.canUploadAudience && (
                    <label className="push-button-secondary push-file-button">
                      Audience
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) handleAudienceFile(campaign, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}

                  <button
                    className="push-button-secondary"
                    disabled={isBusy}
                    onClick={async () => {
                      const results = await run(campaign.id, 'send test', () =>
                        testSendPushCampaign(
                          authenticatedFetch,
                          campaign.id,
                          testTokens
                            .split(/[\s,]+/)
                            .map(token => token.trim())
                            .filter(Boolean)
                        )
                      )
                      if (results) setTestResults(results)
                    }}
                  >
                    Test
                  </button>

                  {permissions.canSubmit && (
                    <button
                      className="push-button-secondary"
                      disabled={isBusy}
                      onClick={async () => {
                        const updated = await run(campaign.id, 'submit', () =>
                          submitPushCampaign(authenticatedFetch, campaign.id)
                        )
                        if (updated) replace(updated)
                      }}
                    >
                      Submit
                    </button>
                  )}

                  {campaign.status === 'pending_approval' && (
                    <button
                      className="push-button-primary"
                      disabled={!permissions.canApprove || isBusy}
                      title={permissions.approveBlockedReason ?? undefined}
                      onClick={async () => {
                        const updated = await run(campaign.id, 'approve', () =>
                          approvePushCampaign(authenticatedFetch, campaign.id)
                        )
                        if (updated) replace(updated)
                      }}
                    >
                      Approve
                    </button>
                  )}

                  {permissions.canCancel && (
                    <button
                      className="push-button-danger"
                      disabled={isBusy}
                      onClick={async () => {
                        const result = await run(campaign.id, 'cancel', () =>
                          cancelPushCampaign(authenticatedFetch, campaign.id)
                        )
                        if (result) replace(result.campaign)
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {isSelected && (
                  <div className="push-detail">
                    {permissions.approveBlockedReason && (
                      <div className="push-warning">{permissions.approveBlockedReason}.</div>
                    )}

                    <div className="push-detail-grid">
                      <div>
                        <span>Created by</span>
                        <code>{campaign.createdBy}</code>
                      </div>
                      {campaign.approvedBy && (
                        <div>
                          <span>Approved by</span>
                          <code>{campaign.approvedBy}</code>
                        </div>
                      )}
                      <div>
                        <span>Deep link</span>
                        <code>{campaign.deepLink}</code>
                      </div>
                    </div>

                    <label className="push-field">
                      <span>Test recipients (FCM tokens, optional)</span>
                      <input
                        value={testTokens}
                        placeholder="Leave empty to use the configured team devices"
                        onChange={e => setTestTokens(e.target.value)}
                      />
                    </label>

                    {testResults && (
                      <div className="push-report">
                        {testResults.map((result, index) => (
                          <div key={index} className={result.ok ? 'push-report-ok' : 'push-report-bad'}>
                            {result.ok ? 'Delivered to FCM' : `Failed: ${result.errorCode}`}
                          </div>
                        ))}
                      </div>
                    )}

                    {audienceReport && (
                      <div className="push-report">
                        <strong>
                          {audienceReport.valid.toLocaleString()} of{' '}
                          {audienceReport.received.toLocaleString()} rows accepted
                        </strong>
                        <div>
                          {audienceReport.duplicates} duplicate
                          {audienceReport.duplicates === 1 ? '' : 's'} ·{' '}
                          {audienceReport.suppressed} suppressed (token already known dead) ·{' '}
                          {audienceReport.invalid.length} unreadable
                        </div>
                        {/* Listed rather than summarised: a wrong column order shows up as
                            dozens of identical reasons, which is the fastest way to see it. */}
                        {audienceReport.invalid.slice(0, 10).map(row => (
                          <div className="push-report-bad" key={row.line}>
                            line {row.line}: {row.reason}
                          </div>
                        ))}
                        {audienceReport.invalid.length > 10 && (
                          <div className="push-report-bad">
                            …and {audienceReport.invalid.length - 10} more
                          </div>
                        )}
                      </div>
                    )}

                    {stats && (
                      <div className="push-stats">
                        <div>
                          <strong>{stats.sent.toLocaleString()}</strong>
                          <span>sent</span>
                        </div>
                        <div>
                          <strong>{stats.pending.toLocaleString()}</strong>
                          <span>queued</span>
                        </div>
                        <div>
                          <strong>{stats.inFlight.toLocaleString()}</strong>
                          <span>in flight</span>
                        </div>
                        <div>
                          <strong>{stats.failed.toLocaleString()}</strong>
                          <span>failed</span>
                        </div>
                        <div>
                          <strong>{stats.cancelled.toLocaleString()}</strong>
                          <span>cancelled</span>
                        </div>
                      </div>
                    )}

                    {stats && Object.keys(stats.errors).length > 0 && (
                      <div className="push-report">
                        {Object.entries(stats.errors).map(([code, count]) => (
                          <div className="push-report-bad" key={code}>
                            {code}: {count.toLocaleString()}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="push-note">
                      These are send-log numbers. Opens and click-through come from the{' '}
                      <code>Push Opened</code> event and are read in Metabase — a device handed a
                      notification that never showed it still counts as sent here.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
