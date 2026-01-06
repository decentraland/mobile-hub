import type { FC } from 'react'
import styles from '../styles/FloatingActionButton.module.css'

interface FloatingActionButtonProps {
  onGroupsClick: () => void
  onBansClick: () => void
  disabled?: boolean
  groupCount?: number
  banCount?: number
}

export const FloatingActionButton: FC<FloatingActionButtonProps> = ({
  onGroupsClick,
  onBansClick,
  disabled,
  groupCount = 0,
  banCount = 0
}) => {
  return (
    <div className={styles.fabContainer}>
      {/* Banned Scenes button */}
      <button
        className={`${styles.fab} ${styles.fabBanned}`}
        onClick={onBansClick}
        disabled={disabled}
        title="View banned scenes"
      >
        {/* Ban icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        {banCount > 0 && (
          <span className={`${styles.badge} ${styles.badgeBanned}`}>{banCount}</span>
        )}
      </button>

      {/* Scene Groups button */}
      <button
        className={styles.fab}
        onClick={onGroupsClick}
        disabled={disabled}
        title="View scene groups"
      >
        {/* Layers icon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        {groupCount > 0 && (
          <span className={styles.badge}>{groupCount}</span>
        )}
      </button>
    </div>
  )
}
