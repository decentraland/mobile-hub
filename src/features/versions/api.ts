import { config } from '../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

const GODOT_EXPLORER_RAW =
  'https://raw.githubusercontent.com/decentraland/godot-explorer'
const GODOT_EXPORT_PRESETS_PATH = 'godot/export_presets.cfg'

export interface PlatformVersions {
  minimalRequiredVersionNumber: number
  recommendedVersionNumber: number
}

export interface AppVersions {
  ios: PlatformVersions
  android: PlatformVersions
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function fetchAppVersions(): Promise<AppVersions> {
  const response = await fetch(`${API_BASE}/app-versions`)
  const json: ApiResponse<AppVersions> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to fetch app versions')
  }

  return json.data
}

export async function updateAppVersions(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  values: AppVersions
): Promise<AppVersions> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/app-versions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  const json: ApiResponse<AppVersions> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to update app versions')
  }

  return json.data
}

export interface PlatformCurrentVersion {
  versionNumber: number | null
  displayVersion: string | null
}

export interface BranchVersions {
  ios: PlatformCurrentVersion
  android: PlatformCurrentVersion
}

export type GodotExplorerBranch = 'main' | 'release'

/**
 * Parse export_presets.cfg into section → key/value map.
 * The file uses INI-like syntax with [section.name] headers.
 */
function parseExportPresets(text: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {}
  let currentSection: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      sections[currentSection] ??= {}
      continue
    }

    if (!currentSection) continue

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue

    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()
    sections[currentSection][key] = value
  }

  return sections
}

function stripQuotes(value: string | undefined): string | null {
  if (value === undefined) return null
  const m = value.match(/^"(.*)"$/)
  return m ? m[1] : value
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined) return null
  const unquoted = stripQuotes(value) ?? value
  const n = parseInt(unquoted, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract iOS + Android version info from export_presets.cfg text.
 * Assumes typical Godot preset layout with named "android" and "ios" platforms.
 */
function extractVersionsFromPresets(text: string): BranchVersions {
  const sections = parseExportPresets(text)

  let android: PlatformCurrentVersion = { versionNumber: null, displayVersion: null }
  let ios: PlatformCurrentVersion = { versionNumber: null, displayVersion: null }

  for (const [sectionName, fields] of Object.entries(sections)) {
    const platformName = stripQuotes(fields['name'])
    if (!platformName) continue

    const optionsSection = sections[`${sectionName}.options`] ?? {}

    if (platformName === 'android') {
      android = {
        versionNumber: parseIntOrNull(optionsSection['version/code']),
        displayVersion: stripQuotes(optionsSection['version/name']),
      }
    } else if (platformName === 'ios') {
      ios = {
        versionNumber: parseIntOrNull(optionsSection['application/version']),
        displayVersion: stripQuotes(optionsSection['application/short_version']),
      }
    }
  }

  return { ios, android }
}

export async function fetchGodotExplorerVersions(
  branch: GodotExplorerBranch
): Promise<BranchVersions> {
  const url = `${GODOT_EXPLORER_RAW}/${branch}/${GODOT_EXPORT_PRESETS_PATH}`
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch godot-explorer ${branch} export_presets.cfg (${response.status})`
    )
  }

  const text = await response.text()
  return extractVersionsFromPresets(text)
}
