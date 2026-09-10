import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

const GODOT_EXPLORER_RAW =
  'https://raw.githubusercontent.com/decentraland/godot-explorer'
const GODOT_CARGO_TOML_PATH = 'lib/Cargo.toml'

export interface PlatformVersions {
  minimalRequiredVersionNumber: number
  recommendedVersionNumber: number
}

export interface AppVersions {
  ios: PlatformVersions
  android: PlatformVersions
}

export interface AppVersionsTrack extends AppVersions {
  track: string
  updatedAt: string
  updatedBy: string | null
}

/** Served by the bare `GET /app-versions`, which is all a client up to 1.13.1 can call. */
export const LEGACY_TRACK = 'legacy'

/**
 * The track clients carrying the overlay fix read. The fix ships as another 1.13.1 build,
 * so the version number cannot tell a fixed client from a broken one — asking for this
 * track is what identifies it.
 */
export const CURRENT_TRACK = 'v2'

/**
 * Ceiling the BFF enforces on `legacy.minimalRequiredVersionNumber`. Every build from
 * 1.12.0 up to and including 1.13.1 draws the force-update overlay below the startup
 * splash and never dismisses it, so a hard gate leaves them on an unrecoverable startup
 * spinner instead of the update dialog. Their thresholds are frozen; raise the minimum on
 * `v2` instead. Recommended (soft) versions still render correctly there and are
 * unrestricted.
 */
export const LEGACY_MINIMAL_VERSION_CAP = 101200

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function fetchAppVersions(track?: string): Promise<AppVersions> {
  const path = track ? `/app-versions/${track}` : '/app-versions'
  const response = await fetch(`${API_BASE}${path}`)
  const json: ApiResponse<AppVersions> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to fetch app versions')
  }

  return json.data
}

/** Lists every track. Requires an allowed wallet — the public endpoints serve one track each. */
export async function fetchAppVersionTracks(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<AppVersionsTrack[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/app-versions`)
  const json: ApiResponse<{ tracks: AppVersionsTrack[] }> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to fetch app version tracks')
  }

  return json.data.tracks
}

export async function updateAppVersions(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  track: string,
  values: AppVersions
): Promise<AppVersions> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/app-versions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, ...values }),
  })
  const json: ApiResponse<AppVersions> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to update app versions')
  }

  return json.data
}

export interface BranchVersion {
  versionNumber: number | null
  semver: string | null
}

export type GodotExplorerBranch = 'main' | 'release'

/**
 * Encode a semver "major.minor.patch" (with optional "-suffix") into the
 * monotonic integer scheme used by godot-explorer's version_gate:
 *   major * 100000 + minor * 100 + patch    (minor/patch clamped to 0–99)
 * Must stay in sync with `_parse_version_number` in
 * godot-explorer/godot/src/version_gate.gd.
 * Returns null on parse failure.
 */
export function encodeSemverToVersionNumber(full: string): number | null {
  const base = full.split('-')[0]
  const parts = base.split('.')
  if (parts.length < 2) return null
  const major = Number(parts[0])
  const minorRaw = Number(parts[1])
  const patchRaw = parts.length >= 3 ? Number(parts[2]) : 0
  if (!Number.isInteger(major) || !Number.isInteger(minorRaw) || !Number.isInteger(patchRaw)) {
    return null
  }
  const minor = Math.min(Math.max(minorRaw, 0), 99)
  const patch = Math.min(Math.max(patchRaw, 0), 99)
  return major * 100000 + minor * 100 + patch
}

function extractSemverFromCargoToml(text: string): string | null {
  let inPackage = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      inPackage = sectionMatch[1] === 'package'
      continue
    }
    if (!inPackage) continue
    const m = line.match(/^version\s*=\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return null
}

export async function fetchGodotExplorerVersion(
  branch: GodotExplorerBranch
): Promise<BranchVersion> {
  const url = `${GODOT_EXPLORER_RAW}/${branch}/${GODOT_CARGO_TOML_PATH}`
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch godot-explorer ${branch} Cargo.toml (${response.status})`
    )
  }

  const text = await response.text()
  const semver = extractSemverFromCargoToml(text)
  return {
    versionNumber: semver ? encodeSemverToVersionNumber(semver) : null,
    semver,
  }
}
