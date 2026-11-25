import type { AdminCreator } from './api'

/** Ready to be paid: the email is confirmed and a payout wallet is set. */
export function isVerified(creator: AdminCreator): boolean {
  return Boolean(creator.email_verified_at && creator.payout_wallet)
}
