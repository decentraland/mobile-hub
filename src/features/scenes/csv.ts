import { deepLink, rowTags, rowTitle, type SceneRow, type TagFilter } from './model'

// The columns the old Curation tab exported, which people already open in sheets
const HEADERS = ['Title', 'Description', 'Owner', 'Contact', 'Deeplink', 'Type', 'Tags']

function escapeValue(value: string): string {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function placesCsv(rows: SceneRow[]): string {
  const lines = rows.map(row =>
    [
      rowTitle(row),
      row.info?.description ?? '',
      row.info?.owner ?? '',
      '',
      deepLink(row),
      row.kind === 'world' ? 'world' : 'scene',
      rowTags(row).join(', '),
    ]
      .map(escapeValue)
      .join(',')
  )
  return [HEADERS.join(','), ...lines].join('\n')
}

/** `allowed_ios_places_2026-11-23.csv` for the iOS list, as the Curation export named it. */
export function csvFilename(filter: TagFilter, date: Date): string {
  const day = date.toISOString().split('T')[0]
  const label = filter.kind === 'tag' ? filter.tag : filter.kind === 'ios-unset' ? 'no_ios_status' : 'all'
  return `${label}_places_${day}.csv`
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
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
