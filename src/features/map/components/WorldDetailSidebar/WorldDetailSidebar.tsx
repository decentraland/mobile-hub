import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FC } from 'react'
import type { WorldInfo } from '../../api/worldsApi'
import type { Ban } from '../../api/bansApi'
import type { Place } from '../../types'
import { TagEditor } from '../../../curation'
import styles from './WorldDetailSidebar.module.css'

interface WorldDetailSidebarProps {
  world: WorldInfo
  ban?: Ban | null
  worldPlace?: Place | null
  onClose: () => void
  onBanToggle?: (shouldBan: boolean) => void
  isBanning?: boolean
  onUpdateWorldTags?: (tags: string[]) => Promise<void>
  onCreateWorldPlace?: (worldName: string, tags: string[]) => Promise<Place | null>
}

export const WorldDetailSidebar: FC<WorldDetailSidebarProps> = ({
  world,
  ban,
  worldPlace,
  onClose,
  onBanToggle,
  isBanning = false,
  onUpdateWorldTags,
  onCreateWorldPlace
}) => {
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [editingTags, setEditingTags] = useState<string[]>([])
  const [isSavingTags, setIsSavingTags] = useState(false)
  // Handle Escape key to close sidebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleBanClick = () => {
    onBanToggle?.(!world.isBanned)
  }

  // Initialize editing tags when tag editor opens
  useEffect(() => {
    if (showTagEditor) {
      setEditingTags(worldPlace?.tags || [])
    }
  }, [showTagEditor, worldPlace])

  const handleSaveTags = async () => {
    if (worldPlace && onUpdateWorldTags) {
      // Update existing world place's tags
      setIsSavingTags(true)
      try {
        await onUpdateWorldTags(editingTags)
        setShowTagEditor(false)
      } catch (err) {
        console.error('Failed to update world tags:', err)
      } finally {
        setIsSavingTags(false)
      }
    } else if (onCreateWorldPlace) {
      // Create new world place with tags
      setIsSavingTags(true)
      try {
        await onCreateWorldPlace(world.name, editingTags)
        setShowTagEditor(false)
      } catch (err) {
        console.error('Failed to create world place with tags:', err)
      } finally {
        setIsSavingTags(false)
      }
    }
  }

  const canEditTags = onUpdateWorldTags || onCreateWorldPlace

  // Check if the world was redeployed since being banned
  const wasRedeployed = world.isBanned &&
    world.banSceneId &&
    world.sceneId &&
    world.banSceneId !== world.sceneId

  const sidebarContent = (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.title}>World Details</h3>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.content}>
        {/* Thumbnail */}
        {world.thumbnail && (
          <div className={styles.thumbnailContainer}>
            <img
              src={world.thumbnail}
              alt={world.title}
              className={styles.thumbnail}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}

        {/* World Name/Title */}
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <div className={styles.value}>{world.title}</div>
        </div>

        {/* World Address */}
        <div className={styles.field}>
          <label className={styles.label}>World Address</label>
          <div className={styles.valueSmall}>{world.name}</div>
        </div>

        {/* Description */}
        {world.description && (
          <div className={styles.field}>
            <label className={styles.label}>Description</label>
            <div className={styles.valueSmall}>{world.description}</div>
          </div>
        )}

        {/* Owner */}
        {world.owner && (
          <div className={styles.field}>
            <label className={styles.label}>Owner</label>
            <div className={styles.valueSmall}>{world.owner}</div>
          </div>
        )}

        {/* World Tags (from world metadata) */}
        {world.tags && world.tags.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>World Tags</label>
            <div className={styles.tags}>
              {world.tags.map(tag => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Curation Tags Section */}
        {canEditTags && (
          <div className={styles.field}>
            <label className={styles.label}>
              Tags
              {!showTagEditor && (
                <button
                  className={styles.editTagsButton}
                  onClick={() => setShowTagEditor(true)}
                >
                  Edit
                </button>
              )}
            </label>
            {showTagEditor ? (
              <div className={styles.tagEditorContainer}>
                <TagEditor
                  tags={editingTags}
                  onChange={setEditingTags}
                  disabled={isSavingTags}
                />
                <div className={styles.tagEditorActions}>
                  <button
                    className={styles.tagEditorCancel}
                    onClick={() => setShowTagEditor(false)}
                    disabled={isSavingTags}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.tagEditorSave}
                    onClick={handleSaveTags}
                    disabled={isSavingTags}
                  >
                    {isSavingTags ? 'Saving...' : 'Save Tags'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.tags}>
                {(worldPlace?.tags || []).length > 0 ? (
                  (worldPlace?.tags || []).map(tag => (
                    <span key={tag} className={styles.curationTag}>{tag}</span>
                  ))
                ) : (
                  <span className={styles.noTags}>No tags</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <div className={world.isBanned ? styles.statusBanned : styles.statusActive}>
            {world.isBanned ? 'BANNED' : 'ACTIVE'}
          </div>
        </div>

        {/* Redeploy Warning */}
        {wasRedeployed && (
          <div className={styles.redeployWarning}>
            <div className={styles.redeployWarningHeader}>Redeploy Detected</div>
            <div className={styles.redeployWarningText}>
              This world has been redeployed since it was banned. The content may have changed.
            </div>
          </div>
        )}

        {/* Ban Info (if banned) */}
        {world.isBanned && ban && (
          <div className={styles.banInfo}>
            <div className={styles.banInfoHeader}>Ban Details</div>
            {ban.reason && (
              <div className={styles.field}>
                <label className={styles.label}>Reason</label>
                <div className={styles.valueSmall}>{ban.reason}</div>
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Banned On</label>
              <div className={styles.valueSmall}>
                {new Date(ban.createdAt).toLocaleDateString('en-GB')} at {new Date(ban.createdAt).toLocaleTimeString()}
              </div>
            </div>
            {ban.createdBy && (
              <div className={styles.field}>
                <label className={styles.label}>Banned By</label>
                <div className={styles.valueSmall}>{ban.createdBy}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className={styles.footer}>
        <button
          className={`${styles.banButton} ${world.isBanned ? styles.banned : ''}`}
          onClick={handleBanClick}
          disabled={isBanning}
        >
          {isBanning
            ? (world.isBanned ? 'Unbanning...' : 'Banning...')
            : (world.isBanned ? 'Unban World' : 'Ban World')
          }
        </button>
      </div>
    </div>
  )

  // Use portal to render at body level, avoiding stacking context issues
  return createPortal(sidebarContent, document.body)
}
