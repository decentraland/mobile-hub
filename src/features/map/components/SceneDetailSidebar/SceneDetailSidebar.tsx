import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FC } from 'react'
import type { ParcelCoord, SceneGroup } from '../../types'
import type { Ban } from '../../api/bansApi'
import { fetchSceneByParcel, getParcelRangeString, type SceneInfo } from '../../api/sceneApi'
import styles from './SceneDetailSidebar.module.css'

interface SceneDetailSidebarProps {
  // Either showing a parcel or a group
  parcel?: ParcelCoord
  group?: SceneGroup
  onClose: () => void
  onBanToggle?: (isBanned: boolean, targetGroup?: SceneGroup, parcels?: ParcelCoord[]) => void
  checkIsBanned?: (targetGroup?: SceneGroup, parcels?: ParcelCoord[]) => boolean
  getBanInfo?: (targetGroup?: SceneGroup, parcels?: ParcelCoord[]) => Ban | undefined
  onSceneLoaded?: (parcels: ParcelCoord[]) => void
  onCreateGroup?: (parcels: ParcelCoord[], name: string) => void
  onAddToGroup?: (parcels: ParcelCoord[], groupId: string) => void
  onRemoveFromGroup?: (parcels: ParcelCoord[], groupId: string) => void
  onViewGroup?: (group: SceneGroup) => void
  existingGroups?: SceneGroup[]
}

export const SceneDetailSidebar: FC<SceneDetailSidebarProps> = ({
  parcel,
  group,
  onClose,
  onBanToggle,
  checkIsBanned,
  getBanInfo,
  onSceneLoaded,
  onCreateGroup,
  onAddToGroup,
  onRemoveFromGroup,
  onViewGroup,
  existingGroups = []
}) => {
  const [sceneInfo, setSceneInfo] = useState<SceneInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('new')

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

  // Serialize parcel for stable dependency comparison
  const parcelKey = parcel ? `${parcel.x},${parcel.y}` : null

  // Fetch scene info when parcel changes
  useEffect(() => {
    if (!parcel) return

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setSceneInfo(null)

    fetchSceneByParcel(parcel)
      .then(info => {
        if (cancelled) return
        setSceneInfo(info)
        setIsLoading(false)
        // Notify parent of scene parcels for highlighting
        if (info?.parcels && info.parcels.length > 0) {
          onSceneLoaded?.(info.parcels)
        }
      })
      .catch(err => {
        if (cancelled) return
        console.error('Failed to fetch scene info:', err)
        setError('Failed to load scene information')
        setIsLoading(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelKey, onSceneLoaded])

  // Find which group (if any) already contains these parcels
  const parcelGroupInfo = useMemo(() => {
    if (!sceneInfo?.parcels || sceneInfo.parcels.length === 0) {
      return { belongsToGroup: null, freeParcels: [], allInGroup: false }
    }

    const parcelsToCheck = sceneInfo.parcels
    let belongsToGroup: SceneGroup | null = null

    // Check if any scene parcel is already in a group
    for (const g of existingGroups) {
      const groupParcelSet = new Set(g.parcels.map(p => `${p.x},${p.y}`))
      const overlap = parcelsToCheck.some(p => groupParcelSet.has(`${p.x},${p.y}`))
      if (overlap) {
        belongsToGroup = g
        break
      }
    }

    // Get parcels not in any group
    const allGroupParcels = new Set<string>()
    existingGroups.forEach(g => {
      g.parcels.forEach(p => allGroupParcels.add(`${p.x},${p.y}`))
    })
    const freeParcels = parcelsToCheck.filter(p => !allGroupParcels.has(`${p.x},${p.y}`))

    return {
      belongsToGroup,
      freeParcels,
      allInGroup: freeParcels.length === 0 && belongsToGroup !== null
    }
  }, [sceneInfo?.parcels, existingGroups])

  // Compute ban status based on group or scene parcels
  const targetGroup = group || parcelGroupInfo.belongsToGroup || undefined
  const sceneParcels = sceneInfo?.parcels || (parcel ? [parcel] : [])
  const isBanned = checkIsBanned?.(targetGroup, sceneParcels) ?? false
  const ban = getBanInfo?.(targetGroup, sceneParcels)

  // Check if scene has been redeployed since the ban
  const isRedeployed = useMemo(() => {
    if (!ban?.sceneId || !sceneInfo?.entityId) return false
    return ban.sceneId !== sceneInfo.entityId
  }, [ban?.sceneId, sceneInfo?.entityId])

  const handleBanClick = () => {
    onBanToggle?.(!isBanned, targetGroup, sceneParcels)
  }

  const handleRemoveFromGroup = () => {
    if (sceneInfo?.parcels && sceneInfo.parcels.length > 0 && group) {
      onRemoveFromGroup?.(sceneInfo.parcels, group.id)
    }
  }

  const handleGroupAction = () => {
    if (!sceneInfo?.parcels || sceneInfo.parcels.length === 0) return

    if (selectedGroupId === 'new') {
      // Create new group
      if (sceneInfo.parcels.length > 1) {
        onCreateGroup?.(sceneInfo.parcels, sceneInfo.name)
      }
    } else if (selectedGroupId) {
      // Add to existing group
      onAddToGroup?.(sceneInfo.parcels, selectedGroupId)
    }
  }

  // Check if any parcel already belongs to a group
  const parcelsAlreadyInGroup = parcelGroupInfo.belongsToGroup !== null
  // Show group action section if we have parcels and either can create or add to group
  const canCreateNew = sceneInfo?.parcels && sceneInfo.parcels.length > 1 && onCreateGroup
  const canAddToExisting = sceneInfo?.parcels && sceneInfo.parcels.length > 0 && existingGroups.length > 0 && onAddToGroup
  const showGroupActions = !group && (canCreateNew || canAddToExisting)
  const groupActionsDisabled = parcelsAlreadyInGroup

  // Update selectedGroupId when canCreateNew changes
  useEffect(() => {
    if (canCreateNew) {
      setSelectedGroupId('new')
    } else if (existingGroups.length > 0) {
      setSelectedGroupId(existingGroups[0].id)
    }
  }, [canCreateNew, existingGroups])

  // Determine button text based on selection
  const isCreatingNew = selectedGroupId === 'new'
  const actionButtonText = isCreatingNew ? 'Create Group' : 'Add to Group'
  const actionButtonDisabled = !selectedGroupId || (isCreatingNew && (!sceneInfo?.parcels || sceneInfo.parcels.length < 2))

  // Determine what parcels to show
  const displayParcels = sceneInfo?.parcels || group?.parcels || (parcel ? [parcel] : [])
  const hasNoScene = !isLoading && !error && !sceneInfo
  const title = group?.name || sceneInfo?.name || (hasNoScene ? 'Empty Parcel' : 'Loading...')
  const description = group?.description || sceneInfo?.description || ''

  const sidebarContent = (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.title}>{hasNoScene ? 'Parcel Details' : 'Scene Details'}</h3>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>Loading scene info...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            {/* Thumbnail */}
            {sceneInfo?.thumbnail && (
              <div className={styles.thumbnailContainer}>
                <img
                  src={sceneInfo.thumbnail}
                  alt={title}
                  className={styles.thumbnail}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}

            {/* No scene indicator */}
            {hasNoScene && (
              <div className={styles.noScene}>
                No scene deployed
              </div>
            )}

            {/* Scene Name */}
            {!hasNoScene && (
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <div className={styles.value}>{title}</div>
              </div>
            )}

            {/* Description */}
            {description && (
              <div className={styles.field}>
                <label className={styles.label}>Description</label>
                <div className={styles.valueSmall}>{description}</div>
              </div>
            )}

            {/* Coordinates */}
            <div className={styles.field}>
              <label className={styles.label}>Parcels</label>
              <div className={styles.value}>
                {getParcelRangeString(displayParcels)}
                {displayParcels.length > 1 && (
                  <span className={styles.parcelCount}>
                    ({displayParcels.length} parcels)
                  </span>
                )}
              </div>
            </div>

            {/* Owner */}
            {sceneInfo?.owner && (
              <div className={styles.field}>
                <label className={styles.label}>Owner</label>
                <div className={styles.valueSmall}>{sceneInfo.owner}</div>
              </div>
            )}

            {/* Tags */}
            {sceneInfo?.tags && sceneInfo.tags.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Tags</label>
                <div className={styles.tags}>
                  {sceneInfo.tags.map(tag => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Group indicator - show if viewing a group OR if scene belongs to a group */}
            {(group || parcelGroupInfo.belongsToGroup) && (
              <div className={styles.field}>
                <label className={styles.label}>Scene Group</label>
                <button
                  className={styles.groupBadge}
                  style={{ backgroundColor: group?.color || parcelGroupInfo.belongsToGroup?.color }}
                  onClick={() => {
                    const targetGroup = group || parcelGroupInfo.belongsToGroup
                    if (targetGroup) {
                      onViewGroup?.(targetGroup)
                    }
                  }}
                >
                  {group?.name || parcelGroupInfo.belongsToGroup?.name}
                </button>
              </div>
            )}

            {/* Deployed date */}
            {sceneInfo?.deployedAt && (
              <div className={styles.field}>
                <label className={styles.label}>Deployed</label>
                <div className={styles.valueSmall}>
                  {sceneInfo.deployedAt.toLocaleDateString('en-GB')}
                </div>
              </div>
            )}

            {/* Ban Info (if banned) */}
            {isBanned && ban && (
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
                {isRedeployed && (
                  <div className={styles.redeployWarning}>
                    Scene has been re-deployed since ban
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer buttons */}
      <div className={styles.footer}>
        {showGroupActions && !group && (
          <div className={styles.addToGroupSection}>
            {groupActionsDisabled ? (
              <div className={styles.disabledMessage}>
                Already in a group
              </div>
            ) : (
              <>
                <select
                  className={styles.groupSelect}
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  {canCreateNew && (
                    <option value="new">Create new group...</option>
                  )}
                  {existingGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.addToGroupButton}
                  onClick={handleGroupAction}
                  disabled={actionButtonDisabled}
                >
                  {actionButtonText}
                </button>
              </>
            )}
          </div>
        )}
        {group && onRemoveFromGroup && (
          <button
            className={styles.removeFromGroupButton}
            onClick={handleRemoveFromGroup}
          >
            Remove from Group
          </button>
        )}
        <button
          className={`${styles.banButton} ${isBanned ? styles.banned : ''}`}
          onClick={handleBanClick}
        >
          {isBanned
            ? (group || parcelGroupInfo.belongsToGroup ? 'Unban Group' : 'Unban Scene')
            : (group || parcelGroupInfo.belongsToGroup ? 'Ban Group' : 'Ban Scene')
          }
        </button>
      </div>
    </div>
  )

  // Use portal to render at body level, avoiding stacking context issues
  return createPortal(sidebarContent, document.body)
}
