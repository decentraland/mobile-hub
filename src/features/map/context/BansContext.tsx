import { createContext, useReducer, useEffect, useCallback, type ReactNode } from 'react'
import { useAuthenticatedFetch } from '../../../hooks/useAuthenticatedFetch'
import {
  fetchAllBans,
  createGroupBan,
  createSceneBan,
  createWorldBan,
  deleteBan,
  isGroupBanned,
  isSceneBanned,
  isWorldBanned,
  getBanForGroup,
  getBanForScene,
  getBanForWorld,
  type Ban,
} from '../api/bansApi'
import type { SceneGroup, ParcelCoord } from '../types'

// State
interface BansState {
  bans: Ban[]
  isLoading: boolean
  error: string | null
}

// Actions
type BansAction =
  | { type: 'SET_BANS'; payload: Ban[] }
  | { type: 'ADD_BAN'; payload: Ban }
  | { type: 'REMOVE_BAN'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }

// Reducer
function bansReducer(state: BansState, action: BansAction): BansState {
  switch (action.type) {
    case 'SET_BANS':
      return { ...state, bans: action.payload, isLoading: false, error: null }
    case 'ADD_BAN':
      return { ...state, bans: [...state.bans, action.payload] }
    case 'REMOVE_BAN':
      return { ...state, bans: state.bans.filter(b => b.id !== action.payload) }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    default:
      return state
  }
}

// Initial state
const initialState: BansState = {
  bans: [],
  isLoading: false,
  error: null,
}

// Context types
interface BansContextValue {
  state: BansState
  // Check functions
  checkGroupBanned: (groupId: string) => boolean
  checkSceneBanned: (parcels: ParcelCoord[]) => boolean
  checkWorldBanned: (worldName: string) => boolean
  // Get ban info functions
  getGroupBan: (groupId: string) => Ban | undefined
  getSceneBan: (parcels: ParcelCoord[]) => Ban | undefined
  getWorldBan: (worldName: string) => Ban | undefined
  // API functions
  banGroup: (group: SceneGroup, reason?: string) => Promise<void>
  unbanGroup: (group: SceneGroup) => Promise<void>
  banScene: (parcels: ParcelCoord[], reason?: string) => Promise<void>
  unbanScene: (parcels: ParcelCoord[]) => Promise<void>
  banWorld: (worldName: string, sceneId?: string, reason?: string) => Promise<void>
  unbanWorld: (worldName: string) => Promise<void>
  // Combined function for UI
  toggleBan: (targetGroup?: SceneGroup, parcels?: ParcelCoord[], shouldBan?: boolean) => Promise<void>
  refreshBans: () => Promise<void>
}

// Create context
export const BansContext = createContext<BansContextValue | null>(null)

// Provider
interface BansProviderProps {
  children: ReactNode
}

export function BansProvider({ children }: BansProviderProps) {
  const [state, dispatch] = useReducer(bansReducer, initialState)
  const authenticatedFetch = useAuthenticatedFetch()

  // Fetch bans on mount
  const refreshBans = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const bans = await fetchAllBans(authenticatedFetch)
      dispatch({ type: 'SET_BANS', payload: bans })
    } catch (err) {
      console.error('Failed to fetch bans:', err)
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to fetch bans' })
    }
  }, [authenticatedFetch])

  useEffect(() => {
    refreshBans()
  }, [refreshBans])

  // Check functions
  const checkGroupBanned = useCallback((groupId: string): boolean => {
    return isGroupBanned(state.bans, groupId)
  }, [state.bans])

  const checkSceneBanned = useCallback((parcels: ParcelCoord[]): boolean => {
    return isSceneBanned(state.bans, parcels)
  }, [state.bans])

  const checkWorldBanned = useCallback((worldName: string): boolean => {
    return isWorldBanned(state.bans, worldName)
  }, [state.bans])

  // Get ban info functions
  const getGroupBan = useCallback((groupId: string): Ban | undefined => {
    return getBanForGroup(state.bans, groupId)
  }, [state.bans])

  const getSceneBan = useCallback((parcels: ParcelCoord[]): Ban | undefined => {
    return getBanForScene(state.bans, parcels)
  }, [state.bans])

  const getWorldBan = useCallback((worldName: string): Ban | undefined => {
    return getBanForWorld(state.bans, worldName)
  }, [state.bans])

  // Ban a group
  const banGroup = useCallback(async (group: SceneGroup, reason?: string) => {
    try {
      const ban = await createGroupBan(authenticatedFetch, { groupId: group.id, reason })
      dispatch({ type: 'ADD_BAN', payload: ban })
    } catch (err) {
      console.error('Failed to ban group:', err)
      throw err
    }
  }, [authenticatedFetch])

  // Unban a group
  const unbanGroup = useCallback(async (group: SceneGroup) => {
    const ban = getBanForGroup(state.bans, group.id)
    if (!ban) return

    try {
      await deleteBan(authenticatedFetch, ban.id)
      dispatch({ type: 'REMOVE_BAN', payload: ban.id })
    } catch (err) {
      console.error('Failed to unban group:', err)
      throw err
    }
  }, [authenticatedFetch, state.bans])

  // Ban a scene
  const banScene = useCallback(async (parcels: ParcelCoord[], reason?: string) => {
    if (parcels.length === 0) return

    try {
      const ban = await createSceneBan(authenticatedFetch, { parcels, reason })
      dispatch({ type: 'ADD_BAN', payload: ban })
    } catch (err) {
      console.error('Failed to ban scene:', err)
      throw err
    }
  }, [authenticatedFetch])

  // Unban a scene
  const unbanScene = useCallback(async (parcels: ParcelCoord[]) => {
    const ban = getBanForScene(state.bans, parcels)
    if (!ban) return

    try {
      await deleteBan(authenticatedFetch, ban.id)
      dispatch({ type: 'REMOVE_BAN', payload: ban.id })
    } catch (err) {
      console.error('Failed to unban scene:', err)
      throw err
    }
  }, [authenticatedFetch, state.bans])

  // Ban a world
  const banWorld = useCallback(async (worldName: string, sceneId?: string, reason?: string) => {
    try {
      const ban = await createWorldBan(authenticatedFetch, { worldName, sceneId, reason })
      dispatch({ type: 'ADD_BAN', payload: ban })
    } catch (err) {
      console.error('Failed to ban world:', err)
      throw err
    }
  }, [authenticatedFetch])

  // Unban a world
  const unbanWorld = useCallback(async (worldName: string) => {
    const ban = getBanForWorld(state.bans, worldName)
    if (!ban) return

    try {
      await deleteBan(authenticatedFetch, ban.id)
      dispatch({ type: 'REMOVE_BAN', payload: ban.id })
    } catch (err) {
      console.error('Failed to unban world:', err)
      throw err
    }
  }, [authenticatedFetch, state.bans])

  // Combined toggle function for UI components
  const toggleBan = useCallback(async (targetGroup?: SceneGroup, parcels?: ParcelCoord[], shouldBan?: boolean) => {
    if (targetGroup) {
      // Handle group ban/unban
      const isBanned = checkGroupBanned(targetGroup.id)
      const newBanState = shouldBan ?? !isBanned

      if (newBanState && !isBanned) {
        await banGroup(targetGroup)
      } else if (!newBanState && isBanned) {
        await unbanGroup(targetGroup)
      }
    } else if (parcels && parcels.length > 0) {
      // Handle scene ban/unban
      const isBanned = checkSceneBanned(parcels)
      const newBanState = shouldBan ?? !isBanned

      if (newBanState && !isBanned) {
        await banScene(parcels)
      } else if (!newBanState && isBanned) {
        await unbanScene(parcels)
      }
    }
  }, [checkGroupBanned, checkSceneBanned, banGroup, unbanGroup, banScene, unbanScene])

  const value: BansContextValue = {
    state,
    checkGroupBanned,
    checkSceneBanned,
    checkWorldBanned,
    getGroupBan,
    getSceneBan,
    getWorldBan,
    banGroup,
    unbanGroup,
    banScene,
    unbanScene,
    banWorld,
    unbanWorld,
    toggleBan,
    refreshBans,
  }

  return <BansContext.Provider value={value}>{children}</BansContext.Provider>
}
