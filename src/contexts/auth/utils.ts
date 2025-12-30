import { ChainId } from '@dcl/schemas'
import type { Avatar } from '@dcl/schemas'
import type { Provider } from 'decentraland-connect'
import type { AuthConfig, AddEthereumChainParameters } from './types'

export const defaultShouldUseBasePath = (host: string): boolean => {
  return /^decentraland.(zone|org|today)$/.test(host)
}

export const defaultFetchAvatar = async (
  address: string,
  peerUrl = 'https://peer.decentraland.org'
): Promise<Avatar | undefined> => {
  try {
    const response = await fetch(`${peerUrl}/lambdas/profiles`, {
      method: 'POST',
      body: JSON.stringify({ ids: [address] })
    })

    const data = await response.json()

    if (data.length > 0 && data[0]?.avatars?.length > 0) {
      return data[0].avatars[0]
    }

    return undefined
  } catch (error) {
    console.error('Error fetching avatar:', error)
    return undefined
  }
}

export const createAuthConfig = (config: AuthConfig): AuthConfig => {
  return {
    shouldUseBasePath: defaultShouldUseBasePath,
    fetchAvatar: (address: string) => defaultFetchAvatar(address),
    ...config,
    debug: config.debug ?? import.meta.env.DEV
  }
}

export const getChainName = (chainId: ChainId): string => {
  const names: Record<number, string> = {
    [ChainId.ETHEREUM_MAINNET]: 'Ethereum Mainnet',
    [ChainId.ETHEREUM_SEPOLIA]: 'Ethereum Sepolia',
    [ChainId.MATIC_MAINNET]: 'Polygon Mainnet',
    [ChainId.MATIC_AMOY]: 'Polygon Amoy'
  }
  return names[chainId] || `Chain ID ${chainId}`
}

export const getAddEthereumChainParameters = (chainId: ChainId): AddEthereumChainParameters => {
  const hexChainId = '0x' + chainId.toString(16)
  const chainName = getChainName(chainId)

  switch (chainId) {
    case ChainId.MATIC_MAINNET:
      return {
        chainId: hexChainId,
        chainName,
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        rpcUrls: ['https://rpc-mainnet.maticvigil.com/'],
        blockExplorerUrls: ['https://polygonscan.com/']
      }
    case ChainId.MATIC_AMOY:
      return {
        chainId: hexChainId,
        chainName,
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        rpcUrls: ['https://rpc-amoy.polygon.technology/'],
        blockExplorerUrls: ['https://www.oklink.com/amoy']
      }
    case ChainId.ETHEREUM_SEPOLIA:
      return {
        chainId: hexChainId,
        chainName,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://sepolia.infura.io/v3/'],
        blockExplorerUrls: ['https://sepolia.etherscan.io']
      }
    default:
      return {
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.infura.io/v3/'],
        blockExplorerUrls: ['https://etherscan.io']
      }
  }
}

export const getProviderChainId = async (provider: Provider): Promise<ChainId> => {
  const chainIdHex = await provider.request({ method: 'eth_chainId' })
  return parseInt(chainIdHex as string, 16) as ChainId
}

export const debugLog = (message: string, data?: unknown, debug = false): void => {
  if (debug && typeof console !== 'undefined') {
    console.log(`[Auth] ${message}`, data || '')
  }
}

export const buildRedirectUrl = (config: AuthConfig, pathname: string, search: string): string => {
  const searchParams = new URLSearchParams(search)
  const currentRedirectTo = searchParams.get('redirectTo')

  const basePath = config.shouldUseBasePath?.(window.location.host) ? config.basePath : ''
  const redirectTo = !currentRedirectTo
    ? `${basePath}${pathname}${search}`
    : `${basePath}${currentRedirectTo}`

  return `${config.authUrl}/login?redirectTo=${encodeURIComponent(window.location.origin + redirectTo)}`
}
