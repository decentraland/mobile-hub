import { useState, useCallback, type FC, type FormEvent } from 'react'
import { useBans, useBansState } from '../features/map/context/useBansHooks'
import { fetchWorldInfo, type WorldInfo } from '../features/map/api/worldsApi'
import { WorldDetailSidebar } from '../features/map/components/WorldDetailSidebar'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { createSceneGroup, updateSceneGroup, fetchSceneGroupByWorldName } from '../features/map/api/sceneGroupsApi'
import type { SceneGroup } from '../features/map/types'
import { GROUP_COLORS } from '../features/map/utils/groupUtils'
import './WorldsPage.css'

export const WorldsPage: FC = () => {
  const [searchValue, setSearchValue] = useState('')
  const [selectedWorld, setSelectedWorld] = useState<WorldInfo | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isBanning, setIsBanning] = useState(false)
  const [worldGroup, setWorldGroup] = useState<SceneGroup | null>(null)

  const { banWorld, unbanWorld, checkWorldBanned, getWorldBan } = useBans()
  const { bans } = useBansState()
  const authenticatedFetch = useAuthenticatedFetch()

  // Filter world bans only
  const worldBans = bans.filter(ban => ban.worldName !== null)

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    if (!searchValue.trim()) return

    setIsSearching(true)
    setSearchError(null)

    try {
      const info = await fetchWorldInfo(searchValue.trim())
      // Update isBanned based on our local state (more accurate than server response)
      setSelectedWorld({
        ...info,
        isBanned: checkWorldBanned(info.name)
      })
      // Fetch the world's group if it exists
      try {
        const group = await fetchSceneGroupByWorldName(authenticatedFetch, info.name)
        setWorldGroup(group)
      } catch {
        setWorldGroup(null)
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to fetch world info')
    } finally {
      setIsSearching(false)
    }
  }

  const handleBanToggle = async (shouldBan: boolean) => {
    if (!selectedWorld) return

    setIsBanning(true)
    try {
      if (shouldBan) {
        // Pass the sceneId when banning to track redeploys
        await banWorld(selectedWorld.name, selectedWorld.sceneId)
      } else {
        await unbanWorld(selectedWorld.name)
      }
      setSelectedWorld({
        ...selectedWorld,
        isBanned: shouldBan,
        banSceneId: shouldBan ? selectedWorld.sceneId : null
      })
    } catch (err) {
      console.error('Failed to toggle world ban:', err)
    } finally {
      setIsBanning(false)
    }
  }

  const handleCloseSidebar = () => {
    setSelectedWorld(null)
    setWorldGroup(null)
    setSearchValue('')
    setSearchError(null)
  }

  const handleWorldCardClick = async (worldName: string) => {
    setIsSearching(true)
    setSearchError(null)
    setSearchValue(worldName)

    try {
      const info = await fetchWorldInfo(worldName)
      setSelectedWorld({
        ...info,
        isBanned: checkWorldBanned(info.name)
      })
      // Fetch the world's group if it exists
      try {
        const group = await fetchSceneGroupByWorldName(authenticatedFetch, info.name)
        setWorldGroup(group)
      } catch {
        setWorldGroup(null)
      }
    } catch (err) {
      // If we can't fetch info, create a minimal WorldInfo from the ban
      // This can happen if the world was deleted after being banned
      const ban = getWorldBan(worldName)
      if (ban) {
        setSelectedWorld({
          name: worldName,
          title: worldName,
          description: null,
          thumbnail: null,
          owner: null,
          tags: [],
          sceneId: '',  // Unknown - world may have been deleted
          isBanned: true,
          banId: ban.id,
          banReason: ban.reason || null,
          banSceneId: ban.sceneId
        })
        // Also try to fetch group for banned worlds
        try {
          const group = await fetchSceneGroupByWorldName(authenticatedFetch, worldName)
          setWorldGroup(group)
        } catch {
          setWorldGroup(null)
        }
      } else {
        setSearchError(err instanceof Error ? err.message : 'Failed to fetch world info')
      }
    } finally {
      setIsSearching(false)
    }
  }

  // Get ban info for the selected world
  const selectedWorldBan = selectedWorld ? getWorldBan(selectedWorld.name) : undefined

  // Handle updating tags for an existing world group
  const handleUpdateWorldTags = useCallback(async (_worldName: string, tags: string[]) => {
    if (!worldGroup) return
    await updateSceneGroup(authenticatedFetch, worldGroup.id, { tags })
    setWorldGroup(prev => prev ? { ...prev, tags } : null)
  }, [authenticatedFetch, worldGroup])

  // Handle creating a new group for a world with tags
  const handleCreateWorldGroup = useCallback(async (
    worldName: string,
    name: string,
    tags: string[]
  ): Promise<SceneGroup | null> => {
    const color = GROUP_COLORS[0] // Default color for worlds
    const newGroup = await createSceneGroup(authenticatedFetch, {
      name,
      worldName,
      tags,
      color,
    })
    setWorldGroup(newGroup)
    return newGroup
  }, [authenticatedFetch])

  return (
    <div className="worlds-page">
      <div className="worlds-container">
        <div className="worlds-search-section">
          <h2>Search World</h2>
          <form className="worlds-search-box" onSubmit={handleSearch}>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Enter world name (e.g., boedo or boedo.dcl.eth)"
              className="worlds-search-input"
              disabled={isSearching}
            />
            <button
              type="submit"
              className="worlds-search-button"
              disabled={isSearching || !searchValue.trim()}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchError && (
            <div className="worlds-error">
              {searchError}
            </div>
          )}
        </div>

        <div className="worlds-list-section">
          <h3>Banned Worlds ({worldBans.length})</h3>
          {worldBans.length === 0 ? (
            <p className="worlds-empty-state">No banned worlds yet.</p>
          ) : (
            <div className="worlds-cards-grid">
              {worldBans.map(ban => (
                <div
                  key={ban.id}
                  className="world-card"
                  onClick={() => handleWorldCardClick(ban.worldName!)}
                >
                  <div className="world-card-name">{ban.worldName}</div>
                  {ban.reason && (
                    <div className="world-card-reason">{ban.reason}</div>
                  )}
                  <div className="world-card-date">
                    Banned: {new Date(ban.createdAt).toLocaleDateString('en-GB')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedWorld && (
        <WorldDetailSidebar
          world={selectedWorld}
          ban={selectedWorldBan}
          worldGroup={worldGroup}
          onClose={handleCloseSidebar}
          onBanToggle={handleBanToggle}
          isBanning={isBanning}
          onUpdateWorldTags={handleUpdateWorldTags}
          onCreateWorldGroup={handleCreateWorldGroup}
        />
      )}
    </div>
  )
}
