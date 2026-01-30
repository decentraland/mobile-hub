import { createContext, useReducer, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from '../../../contexts/auth'
import { useAuthenticatedFetch } from '../../../hooks/useAuthenticatedFetch'
import {
  fetchAllBans,
  createSceneBan,
  createWorldBan,
  createPlaceBan,
  deleteBan,
  isSceneBanned,
  isWorldBanned,
  isPlaceBanned,
  getBanForScene,
  getBanForWorld,
  getBanForPlace,
  type Ban,
} from '../api/bansApi'
import type { Place } from '../types'
import { formatPosition } from '../utils/coordinates'
import type { ParcelCoord } from '../types'

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
  // Check functions (accept either string positions or ParcelCoord for backwards compat)
  checkSceneBanned: (positions: string[] | ParcelCoord[]) => boolean
  checkWorldBanned: (worldName: string) => boolean
  checkPlaceBanned: (placeId: string) => boolean
  // Get ban info functions
  getSceneBan: (positions: string[] | ParcelCoord[]) => Ban | undefined
  getWorldBan: (worldName: string) => Ban | undefined
  getPlaceBan: (placeId: string) => Ban | undefined
  // API functions
  banScene: (positions: string[] | ParcelCoord[], sceneId?: string, reason?: string) => Promise<void>
  unbanScene: (positions: string[] | ParcelCoord[]) => Promise<void>
  banWorld: (worldName: string, sceneId?: string, reason?: string) => Promise<void>
  unbanWorld: (worldName: string) => Promise<void>
  banPlace: (place: Place, sceneId?: string, reason?: string) => Promise<void>
  unbanPlace: (place: Place) => Promise<void>
  // Combined function for UI
  togglePlaceBan: (place: Place, shouldBan?: boolean, sceneId?: string) => Promise<void>
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
  const { isSignedIn } = useAuth()
  const authenticatedFetch = useAuthenticatedFetch()

  // Fetch bans only when signed in
  const refreshBans = useCallback(async () => {
    if (!isSignedIn) {
      dispatch({ type: 'SET_BANS', payload: [] })
      return
    }
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const bans = await fetchAllBans(authenticatedFetch)
      dispatch({ type: 'SET_BANS', payload: bans })
    } catch (err) {
      console.error('Failed to fetch bans:', err)
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to fetch bans' })
    }
  }, [authenticatedFetch, isSignedIn])

  useEffect(() => {
    refreshBans()
  }, [refreshBans])

  // Helper to normalize positions to string array
  const normalizePositions = useCallback((positions: string[] | ParcelCoord[]): string[] => {
    if (positions.length === 0) return []
    if (typeof positions[0] === 'string') {
      return positions as string[]
    }
    return (positions as ParcelCoord[]).map(p => formatPosition(p.x, p.y))
  }, [])

  // Check functions
  const checkSceneBanned = useCallback((positions: string[] | ParcelCoord[]): boolean => {
    return isSceneBanned(state.bans, normalizePositions(positions))
  }, [state.bans, normalizePositions])

  const checkWorldBanned = useCallback((worldName: string): boolean => {
    return isWorldBanned(state.bans, worldName)
  }, [state.bans])

  const checkPlaceBanned = useCallback((placeId: string): boolean => {
    return isPlaceBanned(state.bans, placeId)
  }, [state.bans])

  // Get ban info functions
  const getSceneBan = useCallback((positions: string[] | ParcelCoord[]): Ban | undefined => {
    return getBanForScene(state.bans, normalizePositions(positions))
  }, [state.bans, normalizePositions])

  const getWorldBan = useCallback((worldName: string): Ban | undefined => {
    return getBanForWorld(state.bans, worldName)
  }, [state.bans])

  const getPlaceBan = useCallback((placeId: string): Ban | undefined => {
    return getBanForPlace(state.bans, placeId)
  }, [state.bans])

  // Ban a scene
  const banScene = useCallback(async (positions: string[] | ParcelCoord[], sceneId?: string, reason?: string) => {
    const normalizedPositions = normalizePositions(positions)
    if (normalizedPositions.length === 0) return

    try {
      const ban = await createSceneBan(authenticatedFetch, { positions: normalizedPositions, sceneId, reason })
      dispatch({ type: 'ADD_BAN', payload: ban })
    } catch (err) {
      console.error('Failed to ban scene:', err)
      throw err
    }
  }, [authenticatedFetch, normalizePositions])

  // Unban a scene
  const unbanScene = useCallback(async (positions: string[] | ParcelCoord[]) => {
    const normalizedPositions = normalizePositions(positions)
    const ban = getBanForScene(state.bans, normalizedPositions)
    if (!ban) return

    try {
      await deleteBan(authenticatedFetch, ban.id)
      dispatch({ type: 'REMOVE_BAN', payload: ban.id })
    } catch (err) {
      console.error('Failed to unban scene:', err)
      throw err
    }
  }, [authenticatedFetch, state.bans, normalizePositions])

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

  // Ban a place
  const banPlace = useCallback(async (place: Place, sceneId?: string, reason?: string) => {
    try {
      const ban = await createPlaceBan(authenticatedFetch, { placeId: place.id, sceneId, reason })
      dispatch({ type: 'ADD_BAN', payload: ban })
    } catch (err) {
      console.error('Failed to ban place:', err)
      throw err
    }
  }, [authenticatedFetch])

  // Unban a place
  const unbanPlace = useCallback(async (place: Place) => {
    const ban = getBanForPlace(state.bans, place.id)
    if (!ban) return

    try {
      await deleteBan(authenticatedFetch, ban.id)
      dispatch({ type: 'REMOVE_BAN', payload: ban.id })
    } catch (err) {
      console.error('Failed to unban place:', err)
      throw err
    }
  }, [authenticatedFetch, state.bans])

  // Toggle place ban
  const togglePlaceBan = useCallback(async (place: Place, shouldBan?: boolean, sceneId?: string) => {
    const isBanned = checkPlaceBanned(place.id)
    const newBanState = shouldBan ?? !isBanned

    if (newBanState && !isBanned) {
      await banPlace(place, sceneId)
    } else if (!newBanState && isBanned) {
      await unbanPlace(place)
    }
  }, [checkPlaceBanned, banPlace, unbanPlace])

  const value: BansContextValue = {
    state,
    checkSceneBanned,
    checkWorldBanned,
    checkPlaceBanned,
    getSceneBan,
    getWorldBan,
    getPlaceBan,
    banScene,
    unbanScene,
    banWorld,
    unbanWorld,
    banPlace,
    unbanPlace,
    togglePlaceBan,
    refreshBans,
  }

  return <BansContext.Provider value={value}>{children}</BansContext.Provider>
}
