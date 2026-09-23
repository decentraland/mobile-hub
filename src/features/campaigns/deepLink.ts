// The custom scheme is what Google Ads accepts (the https form needs an assetlinks.json we
// do not serve). Tokens are kebab-case, but encode anyway so a bad one can't break the link.
export function campaignDeepLink(token: string): string {
  return `decentraland://open?c=${encodeURIComponent(token)}`
}
