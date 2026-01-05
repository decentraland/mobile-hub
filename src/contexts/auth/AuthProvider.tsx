import { createContext, useCallback, useContext, useEffect, useState, useMemo, type FC } from 'react'
import { useLocation } from 'react-router-dom'
import { ChainId, type Avatar } from '@dcl/schemas'
import { LocalStorageUtils } from '@dcl/single-sign-on-client'
import { connection } from 'decentraland-connect'
import type { AuthContextValue, AuthProviderProps, UseAuthOptions, ProviderSwitchError } from './types'
import { createAuthConfig, getAddEthereumChainParameters, getProviderChainId, debugLog, buildRedirectUrl } from './utils'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider: FC<AuthProviderProps> = ({ children, config: userConfig }) => {
  const { pathname, search } = useLocation()

  // Memoize configuration to prevent recreation on every render
  const config = useMemo(() => createAuthConfig(userConfig), [userConfig])

  const [wallet, setWallet] = useState<string>()
  const [avatar, setAvatar] = useState<Avatar>()
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [chainId, setChainId] = useState<ChainId>(config.defaultChainId)

  // Sign in - redirect to auth page
  const signIn = useCallback(() => {
    debugLog('Initiating sign in', { pathname, search }, config.debug)
    const redirectUrl = buildRedirectUrl(config, pathname, search)
    debugLog('Redirecting to auth', { redirectUrl }, config.debug)
    window.location.replace(redirectUrl)
  }, [pathname, search, config])

  const signOut = useCallback(() => {
    try {
      debugLog('Signing out', { wallet }, config.debug)

      // Disconnect wallet
      connection.disconnect()

      // Clear identity if we have a wallet address
      if (wallet) {
        LocalStorageUtils.setIdentity(wallet, null)
      }

      // Clear state
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
        debugLog('Changing network', { from: chainId, to: newChainId }, config.debug)

        // Get provider for network switching
        const provider = await connection.getProvider()

        if (!provider) {
          console.error('No provider available to switch network')
          setChainId(ChainId.ETHEREUM_MAINNET)
          return
        }

        // Set desired chain ID in state
        setChainId(newChainId)

        // Try to switch chain using wallet_switchEthereumChain
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + newChainId.toString(16) }]
          })

          // Verify the chain ID has been changed
          const actualChainId = await getProviderChainId(provider)
          if (actualChainId !== newChainId) {
            console.warn('Chain ID did not change as expected')
          }
          debugLog('Network changed successfully', { chainId: actualChainId }, config.debug)
        } catch (error) {
          const switchError = error as ProviderSwitchError
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            debugLog('Adding new chain to wallet', { chainId: newChainId }, config.debug)

            // Try to add the Ethereum chain
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [getAddEthereumChainParameters(newChainId)]
            })

            // Verify chain was added
            const actualChainId = await getProviderChainId(provider)
            if (actualChainId !== newChainId) {
              console.warn('Chain ID not set after adding network')
              setChainId(ChainId.ETHEREUM_MAINNET)
            }
          } else {
            // Unknown error, revert to default chain
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

  // Initialize auth state on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setIsConnecting(true)
        debugLog('Checking auth status', undefined, config.debug)

        // Try to get the previous connection from decentraland-connect
        try {
          const { account: walletAddress, chainId: connectedChainId } = await connection.tryPreviousConnection()

          if (walletAddress) {
            debugLog('Previous connection found', { address: walletAddress, chainId: connectedChainId }, config.debug)

            setWallet(walletAddress)
            setChainId(connectedChainId)

            // Check identity inline to avoid dependency issues
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
                  debugLog('Identity expired', { expiration, now }, config.debug)
                }
              } else {
                debugLog('No identity found', undefined, config.debug)
              }
            } catch (identityError) {
              console.error('Error checking identity:', identityError)
            }

            setIsSignedIn(isValidIdentity)

            // Fetch avatar inline if identity is valid
            if (isValidIdentity && config.fetchAvatar) {
              try {
                debugLog('Fetching avatar', { address: walletAddress }, config.debug)
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

  // Context value
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

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export const useAuth = (_options?: UseAuthOptions): AuthContextValue => {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
