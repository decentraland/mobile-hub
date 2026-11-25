import type { AdminCreator } from './api'
import { isVerified } from './verification'

const COLUMNS: Array<[string, (creator: AdminCreator) => unknown]> = [
  ['address', creator => creator.address],
  ['first_name', creator => creator.first_name],
  ['last_name', creator => creator.last_name],
  ['email', creator => creator.email],
  ['email_verified_at', creator => creator.email_verified_at],
  ['status', creator => creator.status],
  ['enrolled_at', creator => creator.enrolled_at],
  ['terms_version', creator => creator.terms_version],
  ['payout_wallet', creator => creator.payout_wallet?.address],
  ['payout_wallet_updated_at', creator => creator.payout_wallet?.updated_at],
  ['verified', isVerified],
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
  return [
    COLUMNS.map(([name]) => name).join(','),
    ...creators.map(creator => COLUMNS.map(([, read]) => cell(read(creator))).join(',')),
  ].join('\n')
}
