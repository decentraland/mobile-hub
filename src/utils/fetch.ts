import { Authenticator } from '@dcl/crypto'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { LocalStorageUtils } from '@dcl/single-sign-on-client'

const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
const AUTH_METADATA_HEADER = 'x-identity-metadata'

export function signedFetch(url: string, identity: AuthIdentity, init: RequestInit, additionalMetadata: Record<string, unknown> = {}) {
  const path = new URL(url).pathname
  const actualInit = {
    ...init,
    headers: {
      ...getSignedHeaders(
        init?.method ?? 'get',
        path,
        {
          origin: location.origin,
          ...additionalMetadata
        },
        payload => Authenticator.signPayload(identity, payload)
      ),
      ...init?.headers
    }
  }
  return fetch(url, actualInit)
}

function getSignedHeaders(method: string, path: string, metadata: Record<string, unknown>, chainProvider: (payload: string) => AuthChain) {
  const headers: Record<string, string> = {}
  const signature = getAuthChainSignature(method, path, JSON.stringify(metadata), chainProvider)
  signature.authChain.forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = signature.timestamp.toString()
  headers[AUTH_METADATA_HEADER] = signature.metadata
  return headers
}

function getAuthChainSignature(method: string, path: string, metadata: string, chainProvider: (payload: string) => AuthChain) {
  const timestamp = Date.now()
  const payloadParts = [method.toLowerCase(), path.toLowerCase(), timestamp.toString(), metadata]
  const payloadToSign = payloadParts.join(':').toLowerCase()
  const authChain = chainProvider(payloadToSign)

  return {
    authChain,
    metadata,
    timestamp
  }
}

/**
 * Creates an authenticated fetch function that automatically uses signed requests when user is authenticated
 * This function should be used inside React components that have access to useAuth
 *
 * @param wallet - Current wallet address from useAuth
 * @param isSignedIn - Authentication status from useAuth
 * @returns A fetch function that automatically handles authentication
 */
export function createAuthenticatedFetch(wallet?: string, isSignedIn?: boolean) {
  return function authenticatedFetch(url: string, init?: RequestInit, additionalMetadata: Record<string, unknown> = {}): Promise<Response> {
    try {
      // Only attempt signed fetch if user is signed in and we have a wallet
      if (isSignedIn && wallet) {
        const identity = LocalStorageUtils.getIdentity(wallet)

        if (identity && identity.expiration) {
          const expiration = new Date(identity.expiration)
          const now = new Date()

          // Check if identity is still valid
          if (now.getTime() <= expiration.getTime()) {
            return signedFetch(url, identity, init || {}, additionalMetadata)
          }
        }
      }

      // Fall back to regular fetch if not authenticated or no valid identity
      return fetch(url, init)
    } catch (error) {
      console.warn('Error in authenticatedFetch, falling back to regular fetch:', error)
      return fetch(url, init)
    }
  }
}
