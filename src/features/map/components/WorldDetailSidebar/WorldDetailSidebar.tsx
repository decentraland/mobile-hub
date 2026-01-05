import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FC } from 'react'
import type { WorldInfo } from '../../api/worldsApi'
import type { Ban } from '../../api/bansApi'
import styles from './WorldDetailSidebar.module.css'

interface WorldDetailSidebarProps {
  world: WorldInfo
  ban?: Ban | null
  onClose: () => void
  onBanToggle?: (shouldBan: boolean) => void
  isBanning?: boolean
}

export const WorldDetailSidebar: FC<WorldDetailSidebarProps> = ({
  world,
  ban,
  onClose,
  onBanToggle,
  isBanning = false
}) => {
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

        {/* Tags */}
        {world.tags && world.tags.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>Tags</label>
            <div className={styles.tags}>
              {world.tags.map(tag => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
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
                {new Date(ban.createdAt).toLocaleDateString()} at {new Date(ban.createdAt).toLocaleTimeString()}
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
