import { useState, useCallback, useEffect, useMemo } from 'react';
import { GROUP_COLORS, getNextColor } from '../../utils/groupUtils';
import { useGroupsState, useGroupsDispatch, useGroupsApi } from '../../context/useGroupsHooks';
import type { SceneGroup, ParcelCoord } from '../../types';
import styles from './GroupsSidebar.module.css';

interface GroupFormProps {
  editingGroup?: SceneGroup | null;
  selectedParcels: ParcelCoord[];
  onCancel: () => void;
  onSave: () => void;
}

export function GroupForm({
  editingGroup,
  selectedParcels,
  onCancel,
  onSave,
}: GroupFormProps) {
  const { groups, error } = useGroupsState();
  const dispatch = useGroupsDispatch();
  const { createGroup, updateGroup } = useGroupsApi();
  const [isSaving, setIsSaving] = useState(false);

  // Default selection color is reserved and can't be chosen
  const DEFAULT_SELECTION_COLOR = '#00D9FF';

  // Get colors used by other groups (exclude current editing group) + default color
  const usedColors = useMemo(() => {
    const colors = new Set(
      groups
        .filter((g) => g.id !== editingGroup?.id)
        .map((g) => g.color)
    );
    // Reserve default selection color to avoid confusion
    colors.add(DEFAULT_SELECTION_COLOR);
    return colors;
  }, [groups, editingGroup?.id]);

  // Get first available color for new groups
  const getFirstAvailableColor = useCallback(() => {
    if (editingGroup?.color) return editingGroup.color;
    const available = GROUP_COLORS.find((c) => !usedColors.has(c));
    return available || getNextColor(groups);
  }, [editingGroup?.color, usedColors, groups]);

  const [name, setName] = useState(editingGroup?.name || '');
  const [description, setDescription] = useState(editingGroup?.description || '');
  const [color, setColor] = useState(getFirstAvailableColor);
  const [tags, setTags] = useState<string[]>(editingGroup?.tags || []);
  const [tagInput, setTagInput] = useState('');

  const parcels = editingGroup?.parcels || selectedParcels;
  const isEditing = !!editingGroup;

  // Update selection color when color changes (only for new groups, not editing)
  useEffect(() => {
    if (!isEditing) {
      dispatch({ type: 'SET_SELECTION_COLOR', payload: color });
    }
  }, [color, isEditing, dispatch]);

  // Set initial selection color on mount
  useEffect(() => {
    if (!isEditing) {
      dispatch({ type: 'SET_SELECTION_COLOR', payload: color });
    }
    // Reset on unmount
    return () => {
      dispatch({ type: 'SET_SELECTION_COLOR', payload: null });
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || parcels.length === 0 || isSaving) return;

    setIsSaving(true);

    try {
      if (isEditing && editingGroup) {
        const result = await updateGroup(editingGroup.id, {
          name: name.trim(),
          description: description.trim(),
          color,
          tags,
        });
        if (result) {
          onSave();
        }
      } else {
        const result = await createGroup({
          name: name.trim(),
          description: description.trim(),
          color,
          tags,
          parcels: [...parcels],
        });
        if (result) {
          onSave();
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.selectionInfo}>
        <p className={styles.selectionInfoText}>
          {parcels.length} parcel{parcels.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Name *</label>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter group name"
          autoFocus
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Description</label>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Color</label>
        <div className={styles.colorPicker}>
          {GROUP_COLORS.map((c) => {
            const isUsed = usedColors.has(c);
            const isSelected = color === c;
            return (
              <button
                key={c}
                type="button"
                className={`${styles.colorOption} ${isSelected ? styles.colorOptionSelected : ''} ${isUsed ? styles.colorOptionDisabled : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => !isUsed && setColor(c)}
                disabled={isUsed}
                title={isUsed ? 'Color already in use' : undefined}
              />
            );
          })}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Tags</label>
        <div className={styles.tagsInput}>
          {tags.map((tag) => (
            <span key={tag} className={styles.tagInForm}>
              {tag}
              <button
                type="button"
                className={styles.tagRemove}
                onClick={() => removeTag(tag)}
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="text"
            className={styles.tagInput}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={handleAddTag}
            placeholder="Add tag..."
          />
        </div>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.footer} style={{ padding: 0, borderTop: 'none' }}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!name.trim() || parcels.length === 0 || isSaving}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
        </button>
      </div>
    </form>
  );
}
