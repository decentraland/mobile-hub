import type { ChainId, Avatar } from '@dcl/schemas'

export interface AuthContextValue {
  wallet: string | undefined
  chainId: ChainId | undefined
  avatar: Avatar | undefined
  isSignedIn: boolean
  isConnecting: boolean
  signIn: () => void
  signOut: () => void
  changeNetwork: (chainId: ChainId) => Promise<void>
}

export interface AuthConfig {
  defaultChainId: ChainId
  authUrl: string
  basePath: string
  shouldUseBasePath?: (host: string) => boolean
  fetchAvatar?: (address: string) => Promise<Avatar | undefined>
  debug?: boolean
}

export interface AuthProviderProps {
  children: React.ReactNode
  config: AuthConfig
}

export interface UseAuthOptions {
  config?: Partial<AuthConfig>
}

export interface AddEthereumChainParameters {
  chainId: string
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

export interface ProviderSwitchError {
  code?: number
  message?: string
}

export class AuthError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
