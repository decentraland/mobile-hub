import type { FC } from 'react'
import styles from '../styles/FloatingActionButton.module.css'

interface FloatingActionButtonProps {
  onClick: () => void
  disabled?: boolean
  groupCount?: number
}

export const FloatingActionButton: FC<FloatingActionButtonProps> = ({ onClick, disabled, groupCount = 0 }) => {
  return (
    <button
      className={styles.fab}
      onClick={onClick}
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
  )
}
