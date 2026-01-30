import { useState, useCallback, useEffect, type FC, type FormEvent } from 'react'
import { useBans, useBansState } from '../features/map/context/useBansHooks'
import { fetchWorldInfo, type WorldInfo } from '../features/map/api/worldsApi'
import { WorldDetailSidebar } from '../features/map/components/WorldDetailSidebar'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { fetchAllPlaces, fetchPlaceByWorldName, createPlace, updatePlace } from '../features/map/api/placesApi'
import type { Place, PlaceWithBanStatus } from '../features/map/types'
import './WorldsPage.css'

export const WorldsPage: FC = () => {
  const [searchValue, setSearchValue] = useState('')
  const [selectedWorld, setSelectedWorld] = useState<WorldInfo | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isBanning, setIsBanning] = useState(false)
  const [worldPlace, setWorldPlace] = useState<Place | null>(null)
  const [taggedWorlds, setTaggedWorlds] = useState<PlaceWithBanStatus[]>([])
  const [isLoadingTagged, setIsLoadingTagged] = useState(true)

  const { banWorld, unbanWorld, checkWorldBanned, getWorldBan } = useBans()
  const { bans } = useBansState()
  const authenticatedFetch = useAuthenticatedFetch()

  // Filter world bans only
  const worldBans = bans.filter(ban => ban.worldName !== null)

  // Load tagged worlds on mount
  useEffect(() => {
    let cancelled = false

    async function loadTaggedWorlds() {
      try {
        setIsLoadingTagged(true)
        const allPlaces = await fetchAllPlaces()
        if (!cancelled) {
          // Filter to only worlds (type === 'world') that have tags
          const worldsWithTags = allPlaces.filter(p => p.type === 'world' && p.tags.length > 0)
          setTaggedWorlds(worldsWithTags)
        }
      } catch (err) {
        console.error('Failed to load tagged worlds:', err)
      } finally {
        if (!cancelled) {
          setIsLoadingTagged(false)
        }
      }
    }

    loadTaggedWorlds()
    return () => { cancelled = true }
  }, [])

  const loadWorld = useCallback(async (worldName: string) => {
    setIsSearching(true)
    setSearchError(null)

    try {
      const info = await fetchWorldInfo(worldName)
      setSelectedWorld({
        ...info,
        isBanned: checkWorldBanned(info.name)
      })
      try {
        const placeResult = await fetchPlaceByWorldName(info.name)
        setWorldPlace(placeResult || null)
      } catch {
        setWorldPlace(null)
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
          sceneId: '',
          isBanned: true,
          banId: ban.id,
          banReason: ban.reason || null,
          banSceneId: ban.sceneId
        })
        try {
          const placeResult = await fetchPlaceByWorldName(worldName)
          setWorldPlace(placeResult || null)
        } catch {
          setWorldPlace(null)
        }
      } else {
        setSearchError(err instanceof Error ? err.message : 'Failed to fetch world info')
      }
    } finally {
      setIsSearching(false)
    }
  }, [checkWorldBanned, getWorldBan])

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      loadWorld(searchValue.trim())
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
    setWorldPlace(null)
    setSearchValue('')
    setSearchError(null)
  }

  const handleWorldCardClick = (worldName: string) => {
    setSearchValue(worldName)
    loadWorld(worldName)
  }

  // Get ban info for the selected world
  const selectedWorldBan = selectedWorld ? getWorldBan(selectedWorld.name) : undefined

  // Handle updating tags for an existing world place
  const handleUpdateWorldTags = useCallback(async (tags: string[]) => {
    if (!worldPlace) return
    const updated = await updatePlace(authenticatedFetch, worldPlace.id, { tags })
    setWorldPlace(updated)
  }, [authenticatedFetch, worldPlace])

  // Handle creating a new place for a world with tags
  const handleCreateWorldPlace = useCallback(async (
    worldName: string,
    tags: string[]
  ): Promise<Place | null> => {
    const newPlace = await createPlace(authenticatedFetch, {
      type: 'world',
      worldName,
      tags,
    })
    setWorldPlace(newPlace)
    return newPlace
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

        <div className="worlds-list-section">
          <h3>Tagged Worlds ({taggedWorlds.length})</h3>
          {isLoadingTagged ? (
            <p className="worlds-empty-state">Loading tagged worlds...</p>
          ) : taggedWorlds.length === 0 ? (
            <p className="worlds-empty-state">No tagged worlds yet.</p>
          ) : (
            <div className="worlds-cards-grid">
              {taggedWorlds.map(place => (
                <div
                  key={place.id}
                  className="world-card world-card-tagged"
                  onClick={() => handleWorldCardClick(place.worldName!)}
                >
                  <div className="world-card-name">{place.worldName}</div>
                  <div className="world-card-tags">
                    {place.tags.map(tag => (
                      <span key={tag} className="world-card-tag">{tag}</span>
                    ))}
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
          worldPlace={worldPlace}
          onClose={handleCloseSidebar}
          onBanToggle={handleBanToggle}
          isBanning={isBanning}
          onUpdateWorldTags={handleUpdateWorldTags}
          onCreateWorldPlace={handleCreateWorldPlace}
        />
      )}
    </div>
  )
}
