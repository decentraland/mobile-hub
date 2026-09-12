/** `0x1234567890…7890` -> `0x1234…7890` */
export function shortenAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
