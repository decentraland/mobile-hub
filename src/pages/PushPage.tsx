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
  syncPushFeed,
  fetchDailySends,
  FEED_DESTINATION_KINDS,
  FEED_TRIGGER_KEYS,
  type PushCampaign,
  type AudienceReport,
  type CampaignStats,
  type TestSendResult,
  type FeedSyncReport,
  type DailySendRow,
} from '../features/push/api'
import {
  emptyDraft,
  draftFromCampaign,
  draftToInput,
  draftWarnings,
  validateDraft,
  permissionsFor,
  statusLabel,
  sliceLabel,
  type PushFormDraft,
} from '../features/push/validation'
import { NotificationPreview } from '../features/push/components/NotificationPreview'
import './PushPage.css'

type Busy = { id: string; action: string } | null

/** Enough to see a week against the one before it, without the table outgrowing the screen. */
const DAILY_DAYS = 14

/** `172800` reads as nothing; "48 hours" is what the form asked for. */
function ttlLabel(ttlSeconds: number): string {
  const hours = Math.round((ttlSeconds / 3600) * 10) / 10
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** When it goes out, in the operator's own words rather than a nullable timestamp. */
function sendAtLabel(campaign: PushCampaign): string {
  if (campaign.isRecurring) return "Each install's own local evening, as the feed queues it"
  if (campaign.scheduledAt) return new Date(campaign.scheduledAt).toLocaleString()
  return 'As soon as it is approved'
}

/** Newest day first, each with its campaigns in the order the server gave them. */
function groupByDay(rows: DailySendRow[]): { day: string; total: number; rows: DailySendRow[] }[] {
  const byDay = new Map<string, DailySendRow[]>()
  for (const row of rows) {
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, dayRows]) => ({ day, rows: dayRows, total: dayRows.reduce((sum, r) => sum + r.sent, 0) }))
}

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

  const [feedReport, setFeedReport] = useState<FeedSyncReport | null>(null)
  const [daily, setDaily] = useState<DailySendRow[] | null>(null)
  const [dailyError, setDailyError] = useState<string | null>(null)

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

  // Its own request and its own error: the campaigns stay usable when this panel cannot load,
  // which is what happens against a server that does not serve it yet.
  const loadDaily = useCallback(async () => {
    try {
      setDaily(await fetchDailySends(authenticatedFetch, DAILY_DAYS))
      setDailyError(null)
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : 'Failed to load sends per day')
    }
  }, [authenticatedFetch])

  useEffect(() => {
    if (!canEdit) {
      setIsLoading(false)
      return
    }
    load()
    loadDaily()
  }, [canEdit, load, loadDaily])

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

  const handleSync = async () => {
    const report = await run('feed', 'read the warehouse feed', () => syncPushFeed(authenticatedFetch))
    if (report) {
      setFeedReport(report)
      // Whatever it queued changed the counts in the list.
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

  const dailyByDay = daily ? groupByDay(daily) : []

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
            Devices register through the app. A one-shot campaign takes an audience resolved in
            the warehouse and uploaded here as a <code>user_id,token[,platform]</code> CSV. A
            recurring campaign declares which slice of the warehouse's lifecycle feed it serves,
            and the feed fills it on its own.
          </p>
          <p className="push-note">
            A campaign has to be approved by someone other than whoever created it, and nothing
            is sent until it is.
          </p>
        </header>

        {loadError && <div className="push-error">{loadError}</div>}
        {actionError && <div className="push-error">{actionError}</div>}

        <section className="push-panel push-feed">
          <div className="push-panel-row">
            <h2>Warehouse feed</h2>
            <button className="push-button-secondary" disabled={busy?.id === 'feed'} onClick={handleSync}>
              Sync feed now
            </button>
          </div>
          <p className="push-note">
            Read every hour on its own. Queues each install's row onto the approved recurring
            campaign for its slice; sends nothing by itself, and the same read twice is a no-op.
          </p>
          {feedReport && (
            <div className="push-report">
              <strong>
                {feedReport.rowsRead.toLocaleString()} rows read · {feedReport.queued.toLocaleString()}{' '}
                queued · {feedReport.alreadyQueued.toLocaleString()} already queued ·{' '}
                {feedReport.suppressed.toLocaleString()} suppressed
              </strong>
              {feedReport.unservedSlices.length > 0 && (
                <div className="push-report-bad">
                  No campaign serves: {feedReport.unservedSlices.join(', ')}
                </div>
              )}
              {feedReport.notAcceptingSlices.length > 0 && (
                <div className="push-report-bad">
                  Not approved yet: {feedReport.notAcceptingSlices.join(', ')}
                </div>
              )}
              {Object.entries(feedReport.rejected).map(([reason, count]) => (
                <div className="push-report-bad" key={reason}>
                  {count.toLocaleString()} rows rejected: {reason}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="push-panel push-daily">
          <h2>Sent per day</h2>
          <p className="push-note">
            Last {DAILY_DAYS} days, UTC. Send-log numbers, not opens.
          </p>
          {dailyError && <div className="push-note">Not available: {dailyError}</div>}
          {daily && dailyByDay.length === 0 && !dailyError && (
            <div className="push-note">Nothing sent in the last {DAILY_DAYS} days.</div>
          )}
          {dailyByDay.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Sent</th>
                  <th>By campaign</th>
                </tr>
              </thead>
              <tbody>
                {dailyByDay.map(({ day, total, rows }) => (
                  <tr key={day}>
                    <td>{day}</td>
                    <td className="push-daily-total">{total.toLocaleString()}</td>
                    <td className="push-daily-breakdown">
                      {rows.map(row => `${row.campaignKey} ${row.sent.toLocaleString()}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

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

              {!editingId && (
                <label className="push-field push-field-check">
                  <input
                    type="checkbox"
                    checked={draft.isRecurring}
                    onChange={e => setDraft({ ...draft, isRecurring: e.target.checked })}
                  />
                  <span>Recurring, filled by the warehouse feed</span>
                  <small>
                    Approved empty. The feed queues each install's row with its own destination
                    and its own local send time, and the campaign never finishes. Cannot be
                    changed later.
                  </small>
                </label>
              )}

              {!editingId && draft.isRecurring && (
                <div className="push-field-row">
                  <label className="push-field">
                    <span>Trigger</span>
                    <select
                      value={draft.triggerKey}
                      onChange={e => setDraft({ ...draft, triggerKey: e.target.value })}
                    >
                      <option value="">—</option>
                      {FEED_TRIGGER_KEYS.map(key => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                    <small>Days since the install's first session.</small>
                    {errors.triggerKey && <em className="push-field-error">{errors.triggerKey}</em>}
                  </label>

                  <label className="push-field">
                    <span>Destination</span>
                    <select
                      value={draft.destinationKind}
                      onChange={e => setDraft({ ...draft, destinationKind: e.target.value })}
                    >
                      <option value="">—</option>
                      {FEED_DESTINATION_KINDS.map(kind => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                    <small>
                      scene: back to where the install played; the deep link below is only the
                      fallback. plaza and discover: the deep link below is the destination.
                    </small>
                    {errors.destinationKind && (
                      <em className="push-field-error">{errors.destinationKind}</em>
                    )}
                  </label>
                </div>
              )}

              {editingId && draft.isRecurring && (
                <p className="push-note">
                  Recurring, serving <code>{draft.triggerKey}/{draft.destinationKind}</code>. The
                  slice is set once; cancel and create a new campaign to change it.
                </p>
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
            const slice = sliceLabel(campaign)

            return (
              <div className={`push-row ${isSelected ? 'push-row-selected' : ''}`} key={campaign.id}>
                <div className="push-row-main" onClick={() => openDetail(campaign)}>
                  <div className="push-row-heading">
                    <code className="push-row-key">{campaign.campaignKey}</code>
                    <span className={`push-status push-status-${campaign.status}`}>
                      {statusLabel(campaign.status)}
                    </span>
                    {slice && <span className="push-badge">recurring · {slice}</span>}
                  </div>
                  <div className="push-row-title">{campaign.title}</div>
                  <div className="push-row-meta">
                    {campaign.audienceCount.toLocaleString()}{' '}
                    {campaign.isRecurring ? 'queued so far' : 'recipients'}
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

                    {campaign.isRecurring && (
                      <div className="push-note">
                        Filled by the warehouse feed for <code>{slice}</code>. Each row is sent at
                        its install's own evening; a drained queue means idle, not finished. To
                        change the copy, cancel and create a new campaign for the same slice.
                      </div>
                    )}

                    {/* Everything the form took, read back next to what the device will show.
                        Edit disappears the moment a campaign is submitted, so the person who
                        approves it has no other way to read the body they are signing off on. */}
                    <div className="push-detail-review">
                      <div className="push-detail-grid">
                        <div className="push-detail-wide">
                          <span>Title</span>
                          <strong>{campaign.title}</strong>
                        </div>
                        <div className="push-detail-wide">
                          <span>Body</span>
                          <p>{campaign.body}</p>
                        </div>
                        <div>
                          <span>{campaign.destinationKind === 'scene' ? 'Fallback deep link' : 'Deep link'}</span>
                          <code>{campaign.deepLink}</code>
                        </div>
                        <div>
                          <span>Image</span>
                          {campaign.imageUrl ? <code>{campaign.imageUrl}</code> : <em>None</em>}
                        </div>
                        <div>
                          <span>Expires after</span>
                          <strong>{ttlLabel(campaign.ttlSeconds)}</strong>
                        </div>
                        <div>
                          <span>Send at</span>
                          <strong>{sendAtLabel(campaign)}</strong>
                        </div>
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
                      </div>

                      <NotificationPreview
                        title={campaign.title}
                        body={campaign.body}
                        imageUrl={campaign.imageUrl ?? ''}
                      />
                    </div>

                    <label className="push-field">
                      <span>Test recipients (device tokens, optional)</span>
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
                            {result.ok ? 'Delivered to the provider' : `Failed: ${result.errorCode}`}
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
