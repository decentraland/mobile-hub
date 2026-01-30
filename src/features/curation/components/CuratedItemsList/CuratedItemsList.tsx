import type { FC } from 'react'
import type { Place, PlaceWithBanStatus } from '../../../map/types'
import { CuratedItemCard } from '../CuratedItemCard/CuratedItemCard'
import styles from './CuratedItemsList.module.css'

interface CuratedItemsListProps {
  places: PlaceWithBanStatus[]
  isLoading: boolean
  onViewPlace?: (place: Place) => void
}

export const CuratedItemsList: FC<CuratedItemsListProps> = ({
  places,
  isLoading,
  onViewPlace
}) => {
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading curated items...</div>
      </div>
    )
  }

  if (places.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>{'\uD83C\uDFF7'}</div>
          <div className={styles.emptyTitle}>No curated items</div>
          <div className={styles.emptyText}>
            Tag scenes or worlds to see them here
          </div>
        </div>
      </div>
    )
  }

  // Group by type
  const worlds = places.filter(p => p.type === 'world')
  const scenes = places.filter(p => p.type === 'scene')
  const bannedCount = places.filter(p => p.isBanned).length

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        {places.length} item{places.length !== 1 ? 's' : ''} found
        {worlds.length > 0 && <span className={styles.stat}>{worlds.length} world{worlds.length !== 1 ? 's' : ''}</span>}
        {scenes.length > 0 && <span className={styles.stat}>{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>}
        {bannedCount > 0 && <span className={styles.statBanned}>{bannedCount} banned</span>}
      </div>

      <div className={styles.grid}>
        {places.map(place => (
          <CuratedItemCard
            key={place.id}
            place={place}
            onClick={() => onViewPlace?.(place)}
          />
        ))}
      </div>
    </div>
  )
}
