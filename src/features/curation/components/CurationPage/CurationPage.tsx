import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import type { SceneGroup, Tag } from '../../../map/types'
import { fetchAllTags, fetchSceneGroupsByTags } from '../../../map/api/sceneGroupsApi'
import { TagFilterBar } from '../TagFilterBar/TagFilterBar'
import { CuratedItemsList } from '../CuratedItemsList/CuratedItemsList'
import styles from './CurationPage.module.css'

interface CurationPageProps {
  onViewGroup?: (group: SceneGroup) => void
}

export const CurationPage: FC<CurationPageProps> = ({ onViewGroup }) => {
  const [tags, setTags] = useState<Tag[]>([])
  const [groups, setGroups] = useState<SceneGroup[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(true)
  const [isLoadingGroups, setIsLoadingGroups] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Load groups when selected tags change
  useEffect(() => {
    let cancelled = false

    async function loadGroups() {
      if (!selectedTags.length) return setGroups([])
      try {
        setIsLoadingGroups(true)
        setError(null)

        // Server now supports multiple tags with AND logic
        let fetchedGroups = await fetchSceneGroupsByTags(
          selectedTags.length > 0 ? selectedTags : undefined
        )

        // If no tags selected, only show groups that have at least one tag
        if (selectedTags.length === 0) {
          fetchedGroups = fetchedGroups.filter(g => g.tags.length > 0)
        }

        if (!cancelled) {
          setGroups(fetchedGroups)
          setIsLoadingGroups(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load curated items')
          setIsLoadingGroups(false)
        }
      }
    }

    loadGroups()
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Curation</h1>
        <p className={styles.subtitle}>
          Manage tagged scenes, groups, and worlds
        </p>
      </div>

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
          />

          <CuratedItemsList
            groups={groups}
            isLoading={isLoadingGroups}
            onViewGroup={onViewGroup}
          />
        </>
      )}
    </div>
  )
}
