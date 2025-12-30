import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo
} from 'react'
import type { FC } from 'react'
import { useLocation } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'
import type { Avatar } from '@dcl/schemas'
import { LocalStorageUtils } from '@dcl/single-sign-on-client'
import { connection } from 'decentraland-connect'
import type {
  AuthContextValue,
  AuthProviderProps,
  UseAuthOptions,
  ProviderSwitchError
} from './types'
import {
  createAuthConfig,
  getAddEthereumChainParameters,
  getProviderChainId,
  debugLog,
  buildRedirectUrl
} from './utils'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider: FC<AuthProviderProps> = ({
  children,
  config: userConfig
}) => {
  const { pathname, search } = useLocation()

  const config = useMemo(() => createAuthConfig(userConfig), [userConfig])

  const [wallet, setWallet] = useState<string>()
  const [avatar, setAvatar] = useState<Avatar>()
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [chainId, setChainId] = useState<ChainId>(config.defaultChainId)

  const signIn = useCallback(() => {
    debugLog('Initiating sign in', { pathname, search }, config.debug)
    const redirectUrl = buildRedirectUrl(config, pathname, search)
    debugLog('Redirecting to auth', { redirectUrl }, config.debug)
    window.location.replace(redirectUrl)
  }, [pathname, search, config])

  const signOut = useCallback(() => {
    try {
      debugLog('Signing out', { wallet }, config.debug)

      connection.disconnect()

      if (wallet) {
        LocalStorageUtils.setIdentity(wallet, null)
      }

      setWallet(undefined)
      setAvatar(undefined)
      setIsSignedIn(false)

      debugLog('Sign out completed', undefined, config.debug)
    } catch (error: unknown) {
      console.error('Error during sign-out:', error)
    }
  }, [wallet, config.debug])

  const changeNetwork = useCallback(
    async (newChainId: ChainId = ChainId.ETHEREUM_MAINNET) => {
      try {
        debugLog(
          'Changing network',
          { from: chainId, to: newChainId },
          config.debug
        )

        const provider = await connection.getProvider()

        if (!provider) {
          console.error('No provider available to switch network')
          setChainId(ChainId.ETHEREUM_MAINNET)
          return
        }

        setChainId(newChainId)

        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + newChainId.toString(16) }]
          })

          const actualChainId = await getProviderChainId(provider)
          if (actualChainId !== newChainId) {
            console.warn('Chain ID did not change as expected')
          }
          debugLog(
            'Network changed successfully',
            { chainId: actualChainId },
            config.debug
          )
        } catch (error) {
          const switchError = error as ProviderSwitchError
          if (switchError.code === 4902) {
            debugLog(
              'Adding new chain to wallet',
              { chainId: newChainId },
              config.debug
            )

            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [getAddEthereumChainParameters(newChainId)]
            })

            const actualChainId = await getProviderChainId(provider)
            if (actualChainId !== newChainId) {
              console.warn('Chain ID not set after adding network')
              setChainId(ChainId.ETHEREUM_MAINNET)
            }
          } else {
            console.error('Error switching network:', switchError)
            setChainId(ChainId.ETHEREUM_MAINNET)
          }
        }
      } catch (error: unknown) {
        console.error('Error during network change:', error)
        setChainId(ChainId.ETHEREUM_MAINNET)
      }
    },
    [chainId, config.debug]
  )

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setIsConnecting(true)
        debugLog('Checking auth status', undefined, config.debug)

        try {
          const { account: walletAddress, chainId: connectedChainId } =
            await connection.tryPreviousConnection()

          if (walletAddress) {
            debugLog(
              'Previous connection found',
              { address: walletAddress, chainId: connectedChainId },
              config.debug
            )

            setWallet(walletAddress)
            setChainId(connectedChainId)

            let isValidIdentity = false
            try {
              const identity = LocalStorageUtils.getIdentity(walletAddress)
              if (identity && identity.expiration) {
                const expiration = new Date(identity.expiration)
                const now = new Date()
                if (now.getTime() <= expiration.getTime()) {
                  debugLog('Identity valid', { expiration }, config.debug)
                  isValidIdentity = true
                } else {
                  debugLog(
                    'Identity expired',
                    { expiration, now },
                    config.debug
                  )
                }
              } else {
                debugLog('No identity found', undefined, config.debug)
              }
            } catch (identityError) {
              console.error('Error checking identity:', identityError)
            }

            setIsSignedIn(isValidIdentity)

            if (isValidIdentity && config.fetchAvatar) {
              try {
                debugLog(
                  'Fetching avatar',
                  { address: walletAddress },
                  config.debug
                )
                const avatarData = await config.fetchAvatar(walletAddress)
                if (avatarData) {
                  setAvatar(avatarData)
                  debugLog('Avatar fetched successfully', avatarData, config.debug)
                }
              } catch (avatarError) {
                console.error('Error fetching avatar:', avatarError)
              }
            }
          } else {
            debugLog('No previous connection found', undefined, config.debug)
          }
        } catch (error) {
          debugLog('Previous connection failed', error, config.debug)
        }
      } catch (error: unknown) {
        console.error('Error checking auth status:', error)
      } finally {
        setIsConnecting(false)
      }
    }

    checkAuthStatus()
  }, [config.debug, config.fetchAvatar])

  const contextValue: AuthContextValue = {
    wallet,
    avatar,
    chainId,
    isSignedIn,
    isConnecting,
    signIn,
    signOut,
    changeNetwork
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  )
}

export const useAuth = (_options?: UseAuthOptions): AuthContextValue => {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
