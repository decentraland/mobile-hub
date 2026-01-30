import type { SceneGroup } from '../../map/types'
import { fetchSceneByParcel } from '../../map/api/sceneApi'
import { fetchWorldInfo } from '../../map/api/worldsApi'

export interface ExportRow {
  title: string
  description: string
  owner: string
  contact: string
  deeplink: string
  type: 'world' | 'scene' | 'group'
  tags: string
}

/**
 * Generate a deeplink for a world or scene
 */
function generateDeeplink(group: SceneGroup): string {
  if (group.worldName) {
    return `decentraland://open?realm=${group.worldName}`
  }

  // For scenes/groups, use the first parcel as position
  if (group.parcels.length > 0) {
    const parcel = group.parcels[0]
    return `decentraland://open?position=${parcel.x},${parcel.y}`
  }

  return ''
}

/**
 * Determine the type of a group
 */
function getGroupType(group: SceneGroup): 'world' | 'scene' | 'group' {
  if (group.worldName) return 'world'
  if (group.parcels.length === 1) return 'scene'
  return 'group'
}

/**
 * Enrich groups with metadata from Catalyst/worlds content server
 */
export async function enrichGroupsWithMetadata(
  groups: SceneGroup[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { owner: string; contact: string; title: string; description: string }>> {
  const metadata = new Map<string, { owner: string; contact: string; title: string; description: string }>()

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    onProgress?.(i + 1, groups.length)

    try {
      if (group.worldName) {
        // Fetch world metadata
        const worldInfo = await fetchWorldInfo(group.worldName)
        metadata.set(group.id, {
          owner: worldInfo.owner || '',
          contact: '', // Worlds don't have separate contact field
          title: worldInfo.title || group.name,
          description: worldInfo.description || group.description
        })
      } else if (group.parcels.length > 0) {
        // Fetch scene metadata from first parcel
        const sceneInfo = await fetchSceneByParcel(group.parcels[0])
        if (sceneInfo) {
          metadata.set(group.id, {
            owner: sceneInfo.owner || '',
            contact: '', // Contact info is in owner field from sceneApi
            title: sceneInfo.name || group.name,
            description: sceneInfo.description || group.description
          })
        }
      }
    } catch (err) {
      // If fetch fails, use group data
      console.warn(`Failed to fetch metadata for ${group.name}:`, err)
    }

    // If we didn't get metadata, use group defaults
    if (!metadata.has(group.id)) {
      metadata.set(group.id, {
        owner: '',
        contact: '',
        title: group.name,
        description: group.description
      })
    }
  }

  return metadata
}

/**
 * Convert groups to CSV rows
 */
export function groupsToExportRows(
  groups: SceneGroup[],
  metadata: Map<string, { owner: string; contact: string; title: string; description: string }>
): ExportRow[] {
  return groups.map(group => {
    const meta = metadata.get(group.id) || {
      owner: '',
      contact: '',
      title: group.name,
      description: group.description
    }

    return {
      title: meta.title,
      description: meta.description,
      owner: meta.owner,
      contact: meta.contact,
      deeplink: generateDeeplink(group),
      type: getGroupType(group),
      tags: group.tags.join(', ')
    }
  })
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: string): string {
  if (!value) return ''

  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    // Escape quotes by doubling them
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

/**
 * Convert export rows to CSV string
 */
export function rowsToCSV(rows: ExportRow[]): string {
  const headers = ['Title', 'Description', 'Owner', 'Contact', 'Deeplink', 'Type', 'Tags']

  const csvRows = [
    headers.join(','),
    ...rows.map(row => [
      escapeCSVValue(row.title),
      escapeCSVValue(row.description),
      escapeCSVValue(row.owner),
      escapeCSVValue(row.contact),
      escapeCSVValue(row.deeplink),
      escapeCSVValue(row.type),
      escapeCSVValue(row.tags)
    ].join(','))
  ]

  return csvRows.join('\n')
}

/**
 * Download a CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Main export function - fetches allowed_ios groups and exports to CSV
 */
export async function exportAllowedIOSToCSV(
  groups: SceneGroup[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // Filter for allowed_ios tag
  const allowedGroups = groups.filter(g => g.tags.includes('allowed_ios'))

  if (allowedGroups.length === 0) {
    throw new Error('No items with allowed_ios tag found')
  }

  // Enrich with metadata
  const metadata = await enrichGroupsWithMetadata(allowedGroups, onProgress)

  // Convert to export rows
  const rows = groupsToExportRows(allowedGroups, metadata)

  // Generate CSV
  const csv = rowsToCSV(rows)

  // Download
  const date = new Date().toISOString().split('T')[0]
  downloadCSV(csv, `allowed_ios_scenes_${date}.csv`)
}
