import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FC } from 'react'
import type { Place, PlaceGroup } from '../../types'
import type { Ban } from '../../api/bansApi'
import { fetchSceneByParcel, getPositionRangeString, type SceneInfo } from '../../api/sceneApi'
import { fetchWorldInfo, type WorldInfo } from '../../api/worldsApi'
import { parsePosition } from '../../utils/coordinates'
import { TagEditor } from '../../../curation'
import styles from './PlaceDetailSidebar.module.css'

interface PlaceDetailSidebarProps {
  place: Place
  onClose: () => void
  // Ban handling
  isBanned?: boolean
  ban?: Ban | null
  onBanToggle?: (shouldBan: boolean, sceneId?: string) => Promise<void>
  isBanning?: boolean
  // Tag editing
  onUpdateTags?: (placeId: string, tags: string[]) => Promise<void>
  // Group management
  onViewGroup?: (groupId: string) => void
  onAssignToGroup?: (placeId: string, groupId: string) => Promise<void>
  onRemoveFromGroup?: (placeId: string) => Promise<void>
  onCreateGroupAndAssign?: (name: string, color: string) => Promise<void>
  availableGroups?: PlaceGroup[]
  // Scene info callback
  onSceneInfoLoaded?: (sceneInfo: SceneInfo) => void
}

export const PlaceDetailSidebar: FC<PlaceDetailSidebarProps> = ({
  place,
  onClose,
  isBanned = false,
  ban,
  onBanToggle,
  isBanning = false,
  onUpdateTags,
  onViewGroup,
  onAssignToGroup,
  onRemoveFromGroup,
  onCreateGroupAndAssign,
  availableGroups = [],
  onSceneInfoLoaded,
}) => {
  const [sceneInfo, setSceneInfo] = useState<SceneInfo | null>(null)
  const [worldInfo, setWorldInfo] = useState<WorldInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [editingTags, setEditingTags] = useState<string[]>([])
  const [isSavingTags, setIsSavingTags] = useState(false)
  const [showGroupSelector, setShowGroupSelector] = useState(false)
  const [isAssigningGroup, setIsAssigningGroup] = useState(false)
  const [showGroupCreator, setShowGroupCreator] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#FF6B6B')
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)

  // Color palette for groups
  const GROUP_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  ]

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

  // Fetch scene or world info based on place type
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setSceneInfo(null)
    setWorldInfo(null)

    if (place.type === 'world' && place.worldName) {
      fetchWorldInfo(place.worldName)
        .then(info => {
          if (cancelled) return
          setWorldInfo(info)
          setIsLoading(false)
        })
        .catch(err => {
          if (cancelled) return
          console.error('Failed to fetch world info:', err)
          setError('Failed to load world information')
          setIsLoading(false)
        })
    } else if (place.type === 'scene' && place.basePosition) {
      const { x, y } = parsePosition(place.basePosition)
      fetchSceneByParcel({ x, y })
        .then(info => {
          if (cancelled) return
          setSceneInfo(info)
          setIsLoading(false)
          // Notify parent about the loaded scene info (for highlighting parcels)
          if (info) {
            onSceneInfoLoaded?.(info)
          }
        })
        .catch(err => {
          if (cancelled) return
          console.error('Failed to fetch scene info:', err)
          setError('Failed to load scene information')
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }

    return () => { cancelled = true }
  }, [place.id, place.type, place.worldName, place.basePosition, onSceneInfoLoaded])

  // Check if redeployed since ban
  const wasRedeployed = useMemo(() => {
    if (!ban?.sceneId) return false
    if (place.type === 'world' && worldInfo?.sceneId) {
      return ban.sceneId !== worldInfo.sceneId
    }
    if (place.type === 'scene' && sceneInfo?.entityId) {
      return ban.sceneId !== sceneInfo.entityId
    }
    return false
  }, [ban?.sceneId, place.type, worldInfo?.sceneId, sceneInfo?.entityId])

  const handleBanClick = async () => {
    const currentSceneId = place.type === 'world'
      ? worldInfo?.sceneId
      : sceneInfo?.entityId
    await onBanToggle?.(!isBanned, currentSceneId)
  }

  // Initialize editing tags when tag editor opens
  useEffect(() => {
    if (showTagEditor) {
      setEditingTags(place.tags || [])
    }
  }, [showTagEditor, place.tags])

  const handleSaveTags = async () => {
    if (onUpdateTags) {
      setIsSavingTags(true)
      try {
        await onUpdateTags(place.id, editingTags)
        setShowTagEditor(false)
      } catch (err) {
        console.error('Failed to update tags:', err)
      } finally {
        setIsSavingTags(false)
      }
    }
  }

  const handleAssignToGroup = async (groupId: string) => {
    if (onAssignToGroup) {
      setIsAssigningGroup(true)
      try {
        await onAssignToGroup(place.id, groupId)
        setShowGroupSelector(false)
      } catch (err) {
        console.error('Failed to assign to group:', err)
      } finally {
        setIsAssigningGroup(false)
      }
    }
  }

  const handleCreateGroupAndAssign = async () => {
    if (onCreateGroupAndAssign && newGroupName.trim()) {
      setIsCreatingGroup(true)
      try {
        await onCreateGroupAndAssign(newGroupName.trim(), newGroupColor)
        setShowGroupCreator(false)
        setShowGroupSelector(false)
        setNewGroupName('')
      } catch (err) {
        console.error('Failed to create group:', err)
      } finally {
        setIsCreatingGroup(false)
      }
    }
  }

  // Get display values based on place type and fetched info
  const displayName = place.type === 'world'
    ? (worldInfo?.title || place.worldName || 'Unknown World')
    : (sceneInfo?.name || `Scene at ${place.basePosition}`)
  const displayDescription = place.type === 'world'
    ? worldInfo?.description
    : sceneInfo?.description
  const thumbnail = place.type === 'world'
    ? worldInfo?.thumbnail
    : sceneInfo?.thumbnail
  const owner = place.type === 'world'
    ? worldInfo?.owner
    : sceneInfo?.owner
  const contentTags = place.type === 'world'
    ? worldInfo?.tags
    : sceneInfo?.tags

  const sidebarContent = (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          Place Details
          <span className={`${styles.typeBadge} ${place.type === 'world' ? styles.typeBadgeWorld : styles.typeBadgeScene}`}>
            {place.type === 'world' ? 'World' : 'Scene'}
          </span>
        </h3>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>Loading {place.type} info...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            {/* Thumbnail */}
            {thumbnail && (
              <div className={styles.thumbnailContainer}>
                <img
                  src={thumbnail}
                  alt={displayName}
                  className={styles.thumbnail}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}

            {/* Name */}
            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <div className={styles.value}>{displayName}</div>
            </div>

            {/* World Address (for worlds only) */}
            {place.type === 'world' && place.worldName && (
              <div className={styles.field}>
                <label className={styles.label}>World Address</label>
                <div className={styles.valueSmall}>{place.worldName}</div>
              </div>
            )}

            {/* Positions (for scenes only) */}
            {place.type === 'scene' && place.positions && place.positions.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Parcels</label>
                <div className={styles.value}>
                  {getPositionRangeString(place.positions)}
                  {place.positions.length > 1 && (
                    <span className={styles.parcelCount}>
                      ({place.positions.length} parcels)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {displayDescription && (
              <div className={styles.field}>
                <label className={styles.label}>Description</label>
                <div className={styles.valueSmall}>{displayDescription}</div>
              </div>
            )}

            {/* Owner */}
            {owner && (
              <div className={styles.field}>
                <label className={styles.label}>Owner</label>
                <div className={styles.valueSmall}>{owner}</div>
              </div>
            )}

            {/* Content Tags (from the scene/world metadata) */}
            {contentTags && contentTags.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>{place.type === 'world' ? 'World' : 'Scene'} Tags</label>
                <div className={styles.tags}>
                  {contentTags.map(tag => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Curation Tags */}
            <div className={styles.field}>
              <label className={styles.label}>
                Curation Tags
                {onUpdateTags && !showTagEditor && (
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
                  {place.tags && place.tags.length > 0 ? (
                    place.tags.map(tag => (
                      <span key={tag} className={styles.curationTag}>{tag}</span>
                    ))
                  ) : (
                    <span className={styles.noTags}>No tags</span>
                  )}
                </div>
              )}
            </div>

            {/* Group */}
            <div className={styles.field}>
              <label className={styles.label}>
                Group
                {!place.groupId && (onAssignToGroup || onCreateGroupAndAssign) && !showGroupSelector && !showGroupCreator && (
                  <button
                    className={styles.editTagsButton}
                    onClick={() => setShowGroupSelector(true)}
                  >
                    Add to Group
                  </button>
                )}
              </label>
              {place.groupId && place.groupName ? (
                <button
                  className={styles.groupBadge}
                  style={{ backgroundColor: place.groupColor || '#6366f1' }}
                  onClick={() => place.groupId && onViewGroup?.(place.groupId)}
                >
                  {place.groupName}
                </button>
              ) : showGroupCreator ? (
                <div className={styles.groupCreator}>
                  <input
                    type="text"
                    className={styles.groupNameInput}
                    placeholder="Group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    disabled={isCreatingGroup}
                    autoFocus
                  />
                  <div className={styles.colorPicker}>
                    {GROUP_COLORS.map(color => (
                      <button
                        key={color}
                        className={`${styles.colorOption} ${newGroupColor === color ? styles.colorOptionSelected : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewGroupColor(color)}
                        disabled={isCreatingGroup}
                        type="button"
                      />
                    ))}
                  </div>
                  <div className={styles.groupCreatorActions}>
                    <button
                      className={styles.groupOptionCancel}
                      onClick={() => {
                        setShowGroupCreator(false)
                        setNewGroupName('')
                      }}
                      disabled={isCreatingGroup}
                    >
                      Cancel
                    </button>
                    <button
                      className={styles.tagEditorSave}
                      onClick={handleCreateGroupAndAssign}
                      disabled={isCreatingGroup || !newGroupName.trim()}
                    >
                      {isCreatingGroup ? 'Creating...' : 'Create Group'}
                    </button>
                  </div>
                </div>
              ) : showGroupSelector ? (
                <div className={styles.groupSelector}>
                  {availableGroups.map(group => (
                    <button
                      key={group.id}
                      className={styles.groupOption}
                      style={{ borderLeftColor: group.color }}
                      onClick={() => handleAssignToGroup(group.id)}
                      disabled={isAssigningGroup}
                    >
                      <span className={styles.groupOptionColor} style={{ backgroundColor: group.color }} />
                      {group.name}
                    </button>
                  ))}
                  {onCreateGroupAndAssign && (
                    <button
                      className={styles.groupOptionCreate}
                      onClick={() => setShowGroupCreator(true)}
                      disabled={isAssigningGroup}
                    >
                      + Create New Group
                    </button>
                  )}
                  <button
                    className={styles.groupOptionCancel}
                    onClick={() => setShowGroupSelector(false)}
                    disabled={isAssigningGroup}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className={styles.noTags}>No group</span>
              )}
            </div>

            {/* Ban Section - only shown when banned */}
            {isBanned && (
              <div className={styles.bannedSection}>
                <div className={styles.bannedHeader}>
                  <span className={styles.bannedBadge}>Banned</span>
                  {onBanToggle && (
                    <button
                      className={styles.unbanLink}
                      onClick={handleBanClick}
                      disabled={isBanning}
                    >
                      {isBanning ? 'Unbanning...' : 'Unban'}
                    </button>
                  )}
                </div>

                {wasRedeployed && (
                  <div className={styles.redeployWarning}>
                    Content has changed since ban was applied
                  </div>
                )}

                {ban && (
                  <div className={styles.banDetails}>
                    {ban.reason && <div className={styles.banReason}>"{ban.reason}"</div>}
                    <div className={styles.banMeta}>
                      {new Date(ban.createdAt).toLocaleDateString('en-GB')}
                      {ban.createdBy && ` · ${ban.createdBy.slice(0, 6)}...${ban.createdBy.slice(-4)}`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer actions */}
      <div className={styles.footer}>
        {place.groupId && onRemoveFromGroup && (
          <button
            className={styles.footerLink}
            onClick={() => onRemoveFromGroup(place.id)}
          >
            Remove from group
          </button>
        )}
        {!isBanned && onBanToggle && (
          <button
            className={styles.footerLinkDanger}
            onClick={handleBanClick}
            disabled={isBanning}
          >
            {isBanning ? 'Banning...' : 'Ban this place'}
          </button>
        )}
      </div>
    </div>
  )

  // Use portal to render at body level, avoiding stacking context issues
  return createPortal(sidebarContent, document.body)
}
