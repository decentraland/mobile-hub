import type { Place } from '../../map/types'
import { fetchSceneByParcel } from '../../map/api/sceneApi'
import { fetchWorldInfo } from '../../map/api/worldsApi'
import { parsePosition } from '../../map/utils/coordinates'

export interface ExportRow {
  title: string
  description: string
  owner: string
  contact: string
  deeplink: string
  type: 'world' | 'scene'
  tags: string
}

/**
 * Generate a deeplink for a world or scene
 */
function generateDeeplink(place: Place): string {
  if (place.type === 'world' && place.worldName) {
    return `decentraland://open?realm=${place.worldName}`
  }

  // For scenes, use the base parcel as position
  if (place.basePosition) {
    return `decentraland://open?position=${place.basePosition}`
  }

  return ''
}

/**
 * Enrich places with metadata from Catalyst/worlds content server
 */
export async function enrichPlacesWithMetadata(
  places: Place[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { owner: string; contact: string; title: string; description: string }>> {
  const metadata = new Map<string, { owner: string; contact: string; title: string; description: string }>()

  for (let i = 0; i < places.length; i++) {
    const place = places[i]
    onProgress?.(i + 1, places.length)

    try {
      if (place.type === 'world' && place.worldName) {
        // Fetch world metadata
        const worldInfo = await fetchWorldInfo(place.worldName)
        metadata.set(place.id, {
          owner: worldInfo.owner || '',
          contact: '',
          title: worldInfo.title || place.worldName,
          description: worldInfo.description || ''
        })
      } else if (place.type === 'scene' && place.basePosition) {
        // Fetch scene metadata from base parcel
        const { x, y } = parsePosition(place.basePosition)
        const sceneInfo = await fetchSceneByParcel({ x, y })
        if (sceneInfo) {
          metadata.set(place.id, {
            owner: sceneInfo.owner || '',
            contact: '',
            title: sceneInfo.name || `Scene at ${place.basePosition}`,
            description: sceneInfo.description || ''
          })
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch metadata for place ${place.id}:`, err)
    }

    // If we didn't get metadata, use place defaults
    if (!metadata.has(place.id)) {
      const defaultTitle = place.type === 'world'
        ? (place.worldName || 'Unknown World')
        : `Scene at ${place.basePosition || 'unknown'}`
      metadata.set(place.id, {
        owner: '',
        contact: '',
        title: defaultTitle,
        description: ''
      })
    }
  }

  return metadata
}

/**
 * Convert places to CSV rows
 */
export function placesToExportRows(
  places: Place[],
  metadata: Map<string, { owner: string; contact: string; title: string; description: string }>
): ExportRow[] {
  return places.map(place => {
    const meta = metadata.get(place.id) || {
      owner: '',
      contact: '',
      title: place.type === 'world' ? (place.worldName || '') : (place.basePosition || 'unknown'),
      description: ''
    }

    return {
      title: meta.title,
      description: meta.description,
      owner: meta.owner,
      contact: meta.contact,
      deeplink: generateDeeplink(place),
      type: place.type,
      tags: place.tags.join(', ')
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
 * Main export function - exports places with allowed_ios tag to CSV
 */
export async function exportAllowedIOSToCSV(
  places: Place[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // Filter for allowed_ios tag
  const allowedPlaces = places.filter(p => p.tags.includes('allowed_ios'))

  if (allowedPlaces.length === 0) {
    throw new Error('No items with allowed_ios tag found')
  }

  // Enrich with metadata
  const metadata = await enrichPlacesWithMetadata(allowedPlaces, onProgress)

  // Convert to export rows
  const rows = placesToExportRows(allowedPlaces, metadata)

  // Generate CSV
  const csv = rowsToCSV(rows)

  // Download
  const date = new Date().toISOString().split('T')[0]
  downloadCSV(csv, `allowed_ios_places_${date}.csv`)
}
