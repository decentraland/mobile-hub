import type { FC } from 'react'
import type { Place, PlaceWithBanStatus } from '../../../map/types'
import { getPositionRangeString } from '../../../map/api/sceneApi'
import styles from './CuratedItemCard.module.css'

interface CuratedItemCardProps {
  place: PlaceWithBanStatus
  onClick?: () => void
}

function getTypeLabel(type: Place['type']): string {
  switch (type) {
    case 'world': return 'World'
    case 'scene': return 'Scene'
    default: return 'Place'
  }
}

function getTypeIcon(type: Place['type']): string {
  switch (type) {
    case 'world': return '\uD83C\uDF0D'
    case 'scene': return '\uD83C\uDFE0'
    default: return '\uD83D\uDCCD'
  }
}

export const CuratedItemCard: FC<CuratedItemCardProps> = ({ place, onClick }) => {
  const { isBanned } = place
  const typeLabel = getTypeLabel(place.type)
  const typeIcon = getTypeIcon(place.type)

  // Get display name: prefer place name, then group name, then fallback
  const displayName = place.name
    || (place.type === 'world' ? place.worldName : null)
    || place.groupName
    || (place.positions.length > 0 ? `Scene at ${place.basePosition}` : 'Unknown Place')

  return (
    <div className={`${styles.card} ${isBanned ? styles.banned : ''}`} onClick={onClick}>
      <div className={styles.header}>
        {place.groupColor && (
          <span
            className={styles.colorDot}
            style={{ backgroundColor: place.groupColor }}
          />
        )}
        <span className={styles.typeBadge} data-type={place.type}>
          {typeIcon} {typeLabel}
        </span>
        {isBanned && (
          <span className={styles.bannedBadge}>BANNED</span>
        )}
      </div>

      <h3 className={styles.name}>{displayName}</h3>

      <div className={styles.meta}>
        {place.type === 'world' ? (
          <span className={styles.worldName}>{place.worldName}</span>
        ) : (
          <span className={styles.parcels}>
            {getPositionRangeString(place.positions)}
            {place.positions.length > 1 && (
              <span className={styles.parcelCount}>
                ({place.positions.length} parcels)
              </span>
            )}
          </span>
        )}
      </div>

      <div className={styles.tags}>
        {place.tags.map(tag => (
          <span key={tag} className={styles.tag}>{tag}</span>
        ))}
      </div>
    </div>
  )
}
