import type { FC } from 'react'
import type { SceneGroup } from '../../../map/types'
import { getParcelRangeString } from '../../../map/api/sceneApi'
import styles from './CuratedItemCard.module.css'

interface CuratedItemCardProps {
  group: SceneGroup
  onClick?: () => void
}

type ItemType = 'world' | 'scene' | 'group'

function getItemType(group: SceneGroup): ItemType {
  if (group.worldName !== null) return 'world'
  if (group.parcels.length === 1) return 'scene'
  return 'group'
}

function getTypeLabel(type: ItemType): string {
  switch (type) {
    case 'world': return 'World'
    case 'scene': return 'Scene'
    case 'group': return 'Group'
  }
}

function getTypeIcon(type: ItemType): string {
  switch (type) {
    case 'world': return '🌍'
    case 'scene': return '🏠'
    case 'group': return '📦'
  }
}

export const CuratedItemCard: FC<CuratedItemCardProps> = ({ group, onClick }) => {
  const itemType = getItemType(group)
  const typeLabel = getTypeLabel(itemType)
  const typeIcon = getTypeIcon(itemType)

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.header}>
        <span
          className={styles.colorDot}
          style={{ backgroundColor: group.color }}
        />
        <span className={styles.typeBadge} data-type={itemType}>
          {typeIcon} {typeLabel}
        </span>
      </div>

      <h3 className={styles.name}>{group.name}</h3>

      {group.description && (
        <p className={styles.description}>{group.description}</p>
      )}

      <div className={styles.meta}>
        {itemType === 'world' ? (
          <span className={styles.worldName}>{group.worldName}</span>
        ) : (
          <span className={styles.parcels}>
            {getParcelRangeString(group.parcels)}
            {group.parcels.length > 1 && (
              <span className={styles.parcelCount}>
                ({group.parcels.length} parcels)
              </span>
            )}
          </span>
        )}
      </div>

      <div className={styles.tags}>
        {group.tags.map(tag => (
          <span key={tag} className={styles.tag}>{tag}</span>
        ))}
      </div>
    </div>
  )
}
