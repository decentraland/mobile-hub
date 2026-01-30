import { useState, useCallback, useEffect } from 'react'
import type { FC } from 'react'
import { fetchAllTags } from '../../../map/api/placesApi'
import type { Tag } from '../../../map/types'
import styles from './TagEditor.module.css'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

// Common suggested tags
const SUGGESTED_TAGS = ['featured', 'allowed_ios', 'curated']

export const TagEditor: FC<TagEditorProps> = ({
  tags,
  onChange,
  placeholder = 'Add tag...',
  disabled = false
}) => {
  const [input, setInput] = useState('')
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Load available tags for suggestions
  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      try {
        const fetchedTags = await fetchAllTags()
        if (!cancelled) {
          setAvailableTags(fetchedTags)
        }
      } catch (err) {
        // Silently fail - suggestions are optional
      }
    }

    loadTags()
    return () => { cancelled = true }
  }, [])

  const handleAddTag = useCallback((tagName: string) => {
    const normalized = tagName.toLowerCase().trim()
    if (normalized && !tags.includes(normalized)) {
      onChange([...tags, normalized])
    }
    setInput('')
    setShowSuggestions(false)
  }, [tags, onChange])

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove))
  }, [tags, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (input.trim()) {
        handleAddTag(input)
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      handleRemoveTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Filter suggestions based on input
  const filteredSuggestions = availableTags
    .filter(tag =>
      !tags.includes(tag.name) &&
      (input === '' || tag.name.includes(input.toLowerCase()))
    )
    .slice(0, 5)

  // Also include suggested tags not yet used
  const suggestedNotUsed = SUGGESTED_TAGS
    .filter(s => !tags.includes(s) && !filteredSuggestions.some(f => f.name === s))
    .map(name => ({ id: name, name, createdAt: 0 }))

  const allSuggestions = [...filteredSuggestions, ...suggestedNotUsed].slice(0, 5)

  return (
    <div className={styles.container}>
      <div className={styles.tagsContainer}>
        {tags.map(tag => (
          <span key={tag} className={styles.tag}>
            {tag}
            {!disabled && (
              <button
                type="button"
                className={styles.tagRemove}
                onClick={() => handleRemoveTag(tag)}
              >
                &times;
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            className={styles.input}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay to allow clicking suggestions
              setTimeout(() => setShowSuggestions(false), 200)
            }}
            placeholder={tags.length === 0 ? placeholder : ''}
          />
        )}
      </div>

      {showSuggestions && allSuggestions.length > 0 && !disabled && (
        <div className={styles.suggestions}>
          {allSuggestions.map(suggestion => (
            <button
              key={suggestion.name}
              type="button"
              className={styles.suggestion}
              onClick={() => handleAddTag(suggestion.name)}
            >
              {suggestion.name}
              {SUGGESTED_TAGS.includes(suggestion.name) && (
                <span className={styles.suggestedBadge}>suggested</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
