import type { FC } from 'react'
import type { SceneGroup } from '../../../map/types'
import { CuratedItemCard } from '../CuratedItemCard/CuratedItemCard'
import styles from './CuratedItemsList.module.css'

interface CuratedItemsListProps {
  groups: SceneGroup[]
  isLoading: boolean
  onViewGroup?: (group: SceneGroup) => void
}

export const CuratedItemsList: FC<CuratedItemsListProps> = ({
  groups,
  isLoading,
  onViewGroup
}) => {
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading curated items...</div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏷</div>
          <div className={styles.emptyTitle}>No curated items</div>
          <div className={styles.emptyText}>
            Tag scenes, groups, or worlds to see them here
          </div>
        </div>
      </div>
    )
  }

  // Group by type
  const worlds = groups.filter(g => g.worldName !== null)
  const scenes = groups.filter(g => g.worldName === null && g.parcels.length === 1)
  const groupsWithMultipleParcels = groups.filter(g => g.worldName === null && g.parcels.length > 1)

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        {groups.length} item{groups.length !== 1 ? 's' : ''} found
        {worlds.length > 0 && <span className={styles.stat}>{worlds.length} world{worlds.length !== 1 ? 's' : ''}</span>}
        {scenes.length > 0 && <span className={styles.stat}>{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>}
        {groupsWithMultipleParcels.length > 0 && <span className={styles.stat}>{groupsWithMultipleParcels.length} group{groupsWithMultipleParcels.length !== 1 ? 's' : ''}</span>}
      </div>

      <div className={styles.grid}>
        {groups.map(group => (
          <CuratedItemCard
            key={group.id}
            group={group}
            onClick={() => onViewGroup?.(group)}
          />
        ))}
      </div>
    </div>
  )
}
