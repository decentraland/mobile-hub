import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FC } from 'react'
import type { Tag, Place, PlaceWithBanStatus } from '../../../map/types'
import { fetchAllTags } from '../../../map/api/placesApi'
import { fetchAllPlaces } from '../../../map/api/placesApi'
import { TagFilterBar } from '../TagFilterBar/TagFilterBar'
import { CuratedItemsList } from '../CuratedItemsList/CuratedItemsList'
import { exportAllowedIOSToCSV } from '../../utils/csvExport'
import styles from './CurationPage.module.css'

interface CurationPageProps {
  onViewPlace?: (place: Place) => void
}

export const CurationPage: FC<CurationPageProps> = ({ onViewPlace }) => {
  const [tags, setTags] = useState<Tag[]>([])
  const [places, setPlaces] = useState<PlaceWithBanStatus[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(true)
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter places by search query
  const filteredPlaces = useMemo(() => {
    if (!searchQuery.trim()) return places
    const query = searchQuery.toLowerCase()
    return places.filter(p => {
      const name = p.type === 'world'
        ? p.worldName
        : p.basePosition
      return name?.toLowerCase().includes(query) || p.groupName?.toLowerCase().includes(query)
    })
  }, [places, searchQuery])

  // Load all tags on mount
  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      try {
        setIsLoadingTags(true)
        const fetchedTags = await fetchAllTags()
        if (!cancelled) {
          setTags(fetchedTags)
          setIsLoadingTags(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load tags')
          setIsLoadingTags(false)
        }
      }
    }

    loadTags()
    return () => { cancelled = true }
  }, [])

  // Load places when selected tags change
  useEffect(() => {
    let cancelled = false

    async function loadPlaces() {
      if (!selectedTags.length) return setPlaces([])
      try {
        setIsLoadingPlaces(true)
        setError(null)

        // Fetch places with tag filtering (AND logic on server)
        const fetchedPlaces = await fetchAllPlaces(selectedTags)

        if (!cancelled) {
          setPlaces(fetchedPlaces)
          setIsLoadingPlaces(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load curated items')
          setIsLoadingPlaces(false)
        }
      }
    }

    loadPlaces()
    return () => { cancelled = true }
  }, [selectedTags])

  const handleTagToggle = useCallback((tagName: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tagName)) {
        return prev.filter(t => t !== tagName)
      }
      return [...prev, tagName]
    })
  }, [])

  const handleClearTags = useCallback(() => {
    setSelectedTags([])
  }, [])

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true)
      setExportProgress(null)
      setError(null)

      // Fetch all places with allowed_ios tag
      const allowedPlaces = await fetchAllPlaces(['allowed_ios'])

      if (allowedPlaces.length === 0) {
        setError('No items with allowed_ios tag found')
        return
      }

      // Export to CSV with progress tracking
      await exportAllowedIOSToCSV(allowedPlaces, (current, total) => {
        setExportProgress({ current, total })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }, [])

  return (
    <div className={styles.page}>
      {isLoadingTags ? (
        <div className={styles.loading}>Loading tags...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <TagFilterBar
            tags={tags}
            selectedTags={selectedTags}
            onTagToggle={handleTagToggle}
            onClear={handleClearTags}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            exportButton={
              <button
                className={styles.exportButton}
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting
                  ? exportProgress
                    ? `Exporting ${exportProgress.current}/${exportProgress.total}...`
                    : 'Preparing...'
                  : 'Export iOS CSV'}
              </button>
            }
          />

          <CuratedItemsList
            places={filteredPlaces}
            isLoading={isLoadingPlaces}
            onViewPlace={onViewPlace}
          />
        </>
      )}
    </div>
  )
}
