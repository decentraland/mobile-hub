import type { FC } from 'react'
import styles from '../styles/FloatingActionButton.module.css'

interface FloatingActionButtonProps {
  onGroupsClick: () => void
  onBansClick: () => void
  onToggleOverlay?: () => void
  overlayVisible?: boolean
  disabled?: boolean
  groupCount?: number
  banCount?: number
}

export const FloatingActionButton: FC<FloatingActionButtonProps> = ({
  onGroupsClick,
  onBansClick,
  onToggleOverlay,
  overlayVisible = true,
  disabled,
  groupCount = 0,
  banCount = 0
}) => {
  return (
    <div className={styles.fabContainer}>
      {/* Toggle overlay visibility */}
      {onToggleOverlay && (
        <button
          className={`${styles.fab} ${styles.fabSmall} ${!overlayVisible ? styles.fabInactive : ''}`}
          onClick={onToggleOverlay}
          disabled={disabled}
          title={overlayVisible ? "Hide group overlays" : "Show group overlays"}
        >
          {/* Eye icon */}
          {overlayVisible ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>
      )}

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
