import { useCallback, useEffect, useState, type FC } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { useAuth } from '../contexts/auth'
import { isDevMode } from '../utils/devIdentity'
import {
  fetchAppVersions,
  fetchGodotExplorerVersion,
  updateAppVersions,
  type AppVersions,
  type BranchVersion,
  type GodotExplorerBranch,
  type PlatformVersions,
} from '../features/versions/api'
import './VersionsPage.css'

type Platform = 'ios' | 'android'

type DraftState = Record<Platform, { min: string; rec: string }>

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; next: AppVersions; previous: AppVersions }
  | { status: 'saving'; next: AppVersions; previous: AppVersions }
  | { status: 'error'; next: AppVersions; previous: AppVersions; message: string }

const EMPTY_DRAFT: DraftState = {
  ios: { min: '', rec: '' },
  android: { min: '', rec: '' },
}

function toDraft(values: AppVersions): DraftState {
  return {
    ios: {
      min: String(values.ios.minimalRequiredVersionNumber),
      rec: String(values.ios.recommendedVersionNumber),
    },
    android: {
      min: String(values.android.minimalRequiredVersionNumber),
      rec: String(values.android.recommendedVersionNumber),
    },
  }
}

function parseNonNegativeInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

function validatePlatform(draft: { min: string; rec: string }): {
  values?: PlatformVersions
  error?: string
} {
  const min = parseNonNegativeInt(draft.min)
  if (min === null) return { error: 'Minimum must be a non-negative integer' }
  const rec = parseNonNegativeInt(draft.rec)
  if (rec === null) return { error: 'Recommended must be a non-negative integer' }
  if (rec < min) return { error: 'Recommended must be ≥ minimum' }
  return {
    values: { minimalRequiredVersionNumber: min, recommendedVersionNumber: rec },
  }
}

export const VersionsPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSignedIn } = useAuth()
  const canEdit = isSignedIn || isDevMode()

  const [current, setCurrent] = useState<AppVersions | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [confirm, setConfirm] = useState<ConfirmState>({ status: 'idle' })

  const [godotMain, setGodotMain] = useState<BranchVersion | null>(null)
  const [godotRelease, setGodotRelease] = useState<BranchVersion | null>(null)
  const [godotError, setGodotError] = useState<string | null>(null)

  const loadAppVersions = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await fetchAppVersions()
      setCurrent(data)
      setDraft(toDraft(data))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAppVersions()
  }, [loadAppVersions])

  useEffect(() => {
    let cancelled = false

    async function loadBranch(branch: GodotExplorerBranch) {
      try {
        const data = await fetchGodotExplorerVersion(branch)
        if (cancelled) return
        if (branch === 'main') setGodotMain(data)
        else setGodotRelease(data)
      } catch (err) {
        if (!cancelled) {
          setGodotError(
            err instanceof Error ? err.message : 'Failed to fetch godot-explorer versions'
          )
        }
      }
    }

    loadBranch('main')
    loadBranch('release')
    return () => {
      cancelled = true
    }
  }, [])

  const handleStartEdit = (platform: Platform) => {
    if (!current) return
    setEditingPlatform(platform)
    setDraft(toDraft(current))
  }

  const handleCancelEdit = () => {
    if (current) setDraft(toDraft(current))
    setEditingPlatform(null)
  }

  const handleDraftChange = (platform: Platform, field: 'min' | 'rec', value: string) => {
    setDraft(prev => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }))
  }

  const handleRequestSave = () => {
    if (!current || !editingPlatform) return

    const iosResult = validatePlatform(draft.ios)
    const androidResult = validatePlatform(draft.android)
    if (!iosResult.values || !androidResult.values) return

    const next: AppVersions = { ios: iosResult.values, android: androidResult.values }

    const unchanged =
      next.ios.minimalRequiredVersionNumber === current.ios.minimalRequiredVersionNumber &&
      next.ios.recommendedVersionNumber === current.ios.recommendedVersionNumber &&
      next.android.minimalRequiredVersionNumber === current.android.minimalRequiredVersionNumber &&
      next.android.recommendedVersionNumber === current.android.recommendedVersionNumber

    if (unchanged) {
      setEditingPlatform(null)
      return
    }

    setConfirm({ status: 'confirming', next, previous: current })
  }

  const handleConfirmSave = async () => {
    if (confirm.status !== 'confirming' && confirm.status !== 'error') return
    const { next, previous } = confirm
    setConfirm({ status: 'saving', next, previous })
    try {
      const updated = await updateAppVersions(authenticatedFetch, next)
      setCurrent(updated)
      setDraft(toDraft(updated))
      setEditingPlatform(null)
      setConfirm({ status: 'idle' })
    } catch (err) {
      setConfirm({
        status: 'error',
        next,
        previous,
        message: err instanceof Error ? err.message : 'Failed to save',
      })
    }
  }

  const handleCloseConfirm = () => {
    setConfirm({ status: 'idle' })
  }

  const iosValidation = validatePlatform(draft.ios)
  const androidValidation = validatePlatform(draft.android)
  const canSave = !!iosValidation.values && !!androidValidation.values

  return (
    <div className="versions-page">
      <div className="versions-container">
        <header className="versions-header">
          <h1>App Versions</h1>
          <p>
            Force and recommended versions served by <code>GET /app-versions</code>.
            Numbers follow the godot-explorer encoding{' '}
            <code>major × 100000 + minor × 100 + patch</code> (e.g.{' '}
            <code>0.64.3</code> → <code>6403</code>).
          </p>
          {!canEdit && (
            <div className="versions-warning">
              Sign in with an allowed wallet to edit versions.
            </div>
          )}
        </header>

        {isLoading && <div className="versions-loading">Loading…</div>}
        {loadError && (
          <div className="versions-error">
            {loadError}{' '}
            <button className="versions-link-button" onClick={loadAppVersions}>
              Retry
            </button>
          </div>
        )}

        <GodotExplorerBanner
          main={godotMain}
          release={godotRelease}
          error={godotError}
        />

        {current && (
          <div className="versions-cards">
            <PlatformCard
              platform="ios"
              label="iOS"
              current={current.ios}
              draft={draft.ios}
              isEditing={editingPlatform === 'ios'}
              disabled={!canEdit}
              validationError={editingPlatform === 'ios' ? iosValidation.error : undefined}
              canSave={editingPlatform === 'ios' && canSave}
              onStartEdit={() => handleStartEdit('ios')}
              onCancel={handleCancelEdit}
              onDraftChange={handleDraftChange}
              onRequestSave={handleRequestSave}
            />
            <PlatformCard
              platform="android"
              label="Android"
              current={current.android}
              draft={draft.android}
              isEditing={editingPlatform === 'android'}
              disabled={!canEdit}
              validationError={
                editingPlatform === 'android' ? androidValidation.error : undefined
              }
              canSave={editingPlatform === 'android' && canSave}
              onStartEdit={() => handleStartEdit('android')}
              onCancel={handleCancelEdit}
              onDraftChange={handleDraftChange}
              onRequestSave={handleRequestSave}
            />
          </div>
        )}
      </div>

      {(confirm.status === 'confirming' ||
        confirm.status === 'saving' ||
        confirm.status === 'error') && (
        <ConfirmDialog
          state={confirm}
          onConfirm={handleConfirmSave}
          onCancel={handleCloseConfirm}
        />
      )}
    </div>
  )
}

interface PlatformCardProps {
  platform: Platform
  label: string
  current: PlatformVersions
  draft: { min: string; rec: string }
  isEditing: boolean
  disabled: boolean
  validationError: string | undefined
  canSave: boolean
  onStartEdit: () => void
  onCancel: () => void
  onDraftChange: (platform: Platform, field: 'min' | 'rec', value: string) => void
  onRequestSave: () => void
}

const PlatformCard: FC<PlatformCardProps> = ({
  platform,
  label,
  current,
  draft,
  isEditing,
  disabled,
  validationError,
  canSave,
  onStartEdit,
  onCancel,
  onDraftChange,
  onRequestSave,
}) => {
  return (
    <section className="version-card">
      <header className="version-card-header">
        <h2>{label}</h2>
        {!isEditing ? (
          <button
            className="version-edit-button"
            onClick={onStartEdit}
            disabled={disabled}
            title={disabled ? 'Sign in to edit' : 'Edit versions'}
            aria-label={`Edit ${label} versions`}
          >
            ✎
          </button>
        ) : (
          <div className="version-edit-actions">
            <button className="version-button-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="version-button-primary"
              onClick={onRequestSave}
              disabled={!canSave}
            >
              Save…
            </button>
          </div>
        )}
      </header>

      <div className="version-rows">
        <VersionRow
          label="Force (minimum required)"
          hint="Clients below this number are blocked from using the app."
          isEditing={isEditing}
          value={isEditing ? draft.min : String(current.minimalRequiredVersionNumber)}
          onChange={value => onDraftChange(platform, 'min', value)}
        />
        <VersionRow
          label="Recommended"
          hint="Clients below this number see an update prompt."
          isEditing={isEditing}
          value={isEditing ? draft.rec : String(current.recommendedVersionNumber)}
          onChange={value => onDraftChange(platform, 'rec', value)}
        />
      </div>

      {isEditing && validationError && (
        <div className="version-validation-error">{validationError}</div>
      )}
    </section>
  )
}

const GodotExplorerBanner: FC<{
  main: BranchVersion | null
  release: BranchVersion | null
  error: string | null
}> = ({ main, release, error }) => {
  return (
    <section className="godot-banner">
      <div className="godot-banner-label">
        <a
          href="https://github.com/decentraland/godot-explorer"
          target="_blank"
          rel="noreferrer"
        >
          godot-explorer
        </a>{' '}
        current build
      </div>
      <div className="godot-banner-branches">
        <GodotBranchPill
          branchLabel="main"
          branch={main}
          error={error}
          loaded={!!main}
        />
        <GodotBranchPill
          branchLabel="release"
          branch={release}
          error={error}
          loaded={!!release}
        />
      </div>
    </section>
  )
}

const GodotBranchPill: FC<{
  branchLabel: string
  branch: BranchVersion | null
  error: string | null
  loaded: boolean
}> = ({ branchLabel, branch, error, loaded }) => {
  const renderStatus = () => {
    if (loaded) {
      return <strong>{branch?.versionNumber ?? '—'}</strong>
    }
    if (error) {
      return <span className="godot-branch-error">unavailable</span>
    }
    return <span className="godot-branch-loading">loading…</span>
  }

  return (
    <div className="godot-branch-pill">
      <span className="godot-branch-name">{branchLabel}</span>
      <span className="godot-branch-number">{renderStatus()}</span>
      {branch?.semver && (
        <span className="godot-branch-display">v{branch.semver}</span>
      )}
    </div>
  )
}

const VersionRow: FC<{
  label: string
  hint: string
  isEditing: boolean
  value: string
  onChange: (value: string) => void
}> = ({ label, hint, isEditing, value, onChange }) => (
  <div className="version-row">
    <div className="version-row-labels">
      <span className="version-row-label">{label}</span>
      <span className="version-row-hint">{hint}</span>
    </div>
    {isEditing ? (
      <input
        className="version-row-input"
        inputMode="numeric"
        pattern="\d*"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    ) : (
      <div className="version-row-value">{value}</div>
    )}
  </div>
)

const ConfirmDialog: FC<{
  state: Exclude<ConfirmState, { status: 'idle' }>
  onConfirm: () => void
  onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
  const { next, previous } = state
  const saving = state.status === 'saving'
  const errorMessage = state.status === 'error' ? state.message : null

  return (
    <div className="versions-modal-backdrop" onClick={saving ? undefined : onCancel}>
      <div className="versions-modal" onClick={e => e.stopPropagation()}>
        <h3>Confirm version change</h3>
        <p>Review the new values — this will update production settings immediately.</p>

        <div className="versions-diff">
          <DiffBlock
            label="iOS"
            previous={previous.ios}
            next={next.ios}
          />
          <DiffBlock
            label="Android"
            previous={previous.android}
            next={next.android}
          />
        </div>

        {errorMessage && <div className="versions-error">{errorMessage}</div>}

        <div className="versions-modal-actions">
          <button
            className="version-button-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="version-button-primary"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Yes, save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const DiffBlock: FC<{
  label: string
  previous: PlatformVersions
  next: PlatformVersions
}> = ({ label, previous, next }) => {
  const minChanged =
    previous.minimalRequiredVersionNumber !== next.minimalRequiredVersionNumber
  const recChanged =
    previous.recommendedVersionNumber !== next.recommendedVersionNumber

  return (
    <div className="versions-diff-block">
      <h4>{label}</h4>
      <DiffRow
        label="Force"
        from={previous.minimalRequiredVersionNumber}
        to={next.minimalRequiredVersionNumber}
        changed={minChanged}
      />
      <DiffRow
        label="Recommended"
        from={previous.recommendedVersionNumber}
        to={next.recommendedVersionNumber}
        changed={recChanged}
      />
    </div>
  )
}

const DiffRow: FC<{
  label: string
  from: number
  to: number
  changed: boolean
}> = ({ label, from, to, changed }) => (
  <div className={`versions-diff-row ${changed ? 'versions-diff-row-changed' : ''}`}>
    <span className="versions-diff-label">{label}</span>
    <span className="versions-diff-value">
      <span className="versions-diff-from">{from}</span>
      <span className="versions-diff-arrow">→</span>
      <span className="versions-diff-to">{to}</span>
    </span>
  </div>
)
