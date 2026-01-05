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
        console.log('[Auth] Checking auth status...')

        // Log all localStorage keys that might contain identity
        const allKeys = Object.keys(localStorage).filter(k => k.includes('sign') || k.includes('identity') || k.includes('dcl'))
        console.log('[Auth] Relevant localStorage keys:', allKeys)

        // Try to get the previous connection from decentraland-connect
        try {
          console.log('[Auth] Calling connection.tryPreviousConnection()...')
          const { account: walletAddress, chainId: connectedChainId } = await connection.tryPreviousConnection()
          console.log('[Auth] tryPreviousConnection result:', { walletAddress, connectedChainId })

          if (walletAddress) {
            setWallet(walletAddress)
            setChainId(connectedChainId)

            // Check identity inline to avoid dependency issues
            let isValidIdentity = false
            try {
              // Try v2 format
              console.log('[Auth] Checking identity with LocalStorageUtils.getIdentity for:', walletAddress)
              const identity = LocalStorageUtils.getIdentity(walletAddress)
              console.log('[Auth] Identity from LocalStorageUtils:', identity)

              // Also check v1 format directly
              const v1Key = `single-sign-on-${walletAddress.toLowerCase()}`
              const v1Data = localStorage.getItem(v1Key)
              console.log('[Auth] Identity from v1 key (' + v1Key + '):', v1Data)

              if (identity && identity.expiration) {
                const expiration = new Date(identity.expiration)
                const now = new Date()
                console.log('[Auth] Identity expiration check:', { expiration, now, isValid: now.getTime() <= expiration.getTime() })
                if (now.getTime() <= expiration.getTime()) {
                  isValidIdentity = true
                }
              }
            } catch (identityError) {
              console.error('[Auth] Error checking identity:', identityError)
            }

            console.log('[Auth] Setting isSignedIn to:', isValidIdentity)
            setIsSignedIn(isValidIdentity)

            // Fetch avatar inline if identity is valid
            if (isValidIdentity && config.fetchAvatar) {
              try {
                const avatarData = await config.fetchAvatar(walletAddress)
                if (avatarData) {
                  setAvatar(avatarData)
                }
              } catch (avatarError) {
                console.error('[Auth] Error fetching avatar:', avatarError)
              }
            }
          } else {
            console.log('[Auth] No wallet address from tryPreviousConnection')
          }
        } catch (error) {
          console.error('[Auth] tryPreviousConnection failed:', error)
        }
      } catch (error: unknown) {
        console.error('[Auth] Error checking auth status:', error)
      } finally {
        setIsConnecting(false)
        console.log('[Auth] Auth check complete')
      }
    }

    checkAuthStatus()
  }, [config.debug, config])

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
