import type { AdminCreator } from './api'

const COLUMNS: Array<keyof AdminCreator> = [
  'address',
  'first_name',
  'last_name',
  'email',
  'email_verified_at',
  'status',
  'enrolled_at',
  'terms_version',
]

/**
 * Names and emails are typed by the creators themselves. A cell starting with `=`, `+`, `-` or `@`
 * is a formula to Excel and Sheets, so it is prefixed with an apostrophe, which they show as text.
 */
function cell(value: unknown): string {
  const text = String(value ?? '')
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${guarded.replace(/"/g, '""')}"`
}

export function creatorsToCsv(creators: AdminCreator[]): string {
  return [COLUMNS.join(','), ...creators.map(creator => COLUMNS.map(column => cell(creator[column])).join(','))].join(
    '\n'
  )
}
