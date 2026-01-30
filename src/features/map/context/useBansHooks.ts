import { useContext } from 'react'
import { BansContext } from './BansContext'

export function useBans() {
  const context = useContext(BansContext)
  if (!context) {
    throw new Error('useBans must be used within a BansProvider')
  }
  return context
}

export function useBansState() {
  const { state } = useBans()
  return state
}

export function useBansApi() {
  const {
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
  } = useBans()

  return {
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
}
