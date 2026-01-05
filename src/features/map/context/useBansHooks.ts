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
    checkGroupBanned,
    checkSceneBanned,
    banGroup,
    unbanGroup,
    banScene,
    unbanScene,
    toggleBan,
    refreshBans,
  } = useBans()

  return {
    checkGroupBanned,
    checkSceneBanned,
    banGroup,
    unbanGroup,
    banScene,
    unbanScene,
    toggleBan,
    refreshBans,
  }
}
