import type { FC, ReactNode } from 'react'
import type { Tag } from '../../../map/types'
import styles from './TagFilterBar.module.css'

interface TagFilterBarProps {
  tags: Tag[]
  selectedTags: string[]
  onTagToggle: (tagName: string) => void
  onClear: () => void
  exportButton?: ReactNode
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

// Suggested/common tags to highlight
const SUGGESTED_TAGS = ['featured', 'allowed_ios', 'curated']

export const TagFilterBar: FC<TagFilterBarProps> = ({
  tags,
  selectedTags,
  onTagToggle,
  onClear,
  exportButton,
  searchQuery,
  onSearchChange
}) => {
  // Sort tags: suggested first, then alphabetically
  const sortedTags = [...tags].sort((a, b) => {
    const aIsSuggested = SUGGESTED_TAGS.includes(a.name)
    const bIsSuggested = SUGGESTED_TAGS.includes(b.name)

    if (aIsSuggested && !bIsSuggested) return -1
    if (!aIsSuggested && bIsSuggested) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className={styles.container}>
      {onSearchChange && (
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search by name..."
          value={searchQuery || ''}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      )}
      <div className={styles.label}>Filter by tag:</div>
      <div className={styles.tags}>
        {sortedTags.map(tag => {
          const isSelected = selectedTags.includes(tag.name)
          const isSuggested = SUGGESTED_TAGS.includes(tag.name)

          return (
            <button
              key={tag.id}
              className={`${styles.tag} ${isSelected ? styles.tagSelected : ''} ${isSuggested ? styles.tagSuggested : ''}`}
              onClick={() => onTagToggle(tag.name)}
              title={tag.description}
            >
              {tag.name}
            </button>
          )
        })}

        {tags.length === 0 && (
          <span className={styles.noTags}>No tags available</span>
        )}
      </div>

      {selectedTags.length > 0 && (
        <button className={styles.clearButton} onClick={onClear}>
          Clear ({selectedTags.length})
        </button>
      )}

      {exportButton}
    </div>
  )
}
