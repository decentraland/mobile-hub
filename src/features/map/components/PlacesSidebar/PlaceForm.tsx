import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePlacesState, usePlacesDispatch, usePlacesApi } from '../../context/usePlacesHooks';
import { formatPosition, parsePosition } from '../../utils/coordinates';
import type { Place, ParcelCoord } from '../../types';
import styles from './PlacesSidebar.module.css';

// Color palette for places (same as old groups)
const PLACE_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#45B7D1', // blue
  '#96CEB4', // sage
  '#FFEAA7', // yellow
  '#DDA0DD', // plum
  '#98D8C8', // mint
  '#F7DC6F', // gold
  '#BB8FCE', // purple
  '#85C1E9', // sky
];

interface PlaceFormProps {
  editingPlace?: Place | null;
  selectedParcels: ParcelCoord[];
  onCancel: () => void;
  onSave: () => void;
}

export function PlaceForm({
  editingPlace,
  selectedParcels,
  onCancel,
  onSave,
}: PlaceFormProps) {
  const { places, placeGroups, error } = usePlacesState();
  const dispatch = usePlacesDispatch();
  const { createPlace, updatePlace } = usePlacesApi();
  const [isSaving, setIsSaving] = useState(false);

  // Default selection color is reserved and can't be chosen
  const DEFAULT_SELECTION_COLOR = '#00D9FF';

  // Get colors used by other place groups (exclude current editing place's group) + default color
  const usedColors = useMemo(() => {
    const colors = new Set<string>();
    // Add colors from place groups
    placeGroups.forEach(g => colors.add(g.color));
    // Add colors from places that have groupColor but different groupId
    places
      .filter(p => p.id !== editingPlace?.id && p.groupColor)
      .forEach(p => colors.add(p.groupColor!));
    // Reserve default selection color to avoid confusion
    colors.add(DEFAULT_SELECTION_COLOR);
    return colors;
  }, [places, placeGroups, editingPlace?.id]);

  // Get first available color for new places
  const getFirstAvailableColor = useCallback(() => {
    if (editingPlace?.groupColor) return editingPlace.groupColor;
    const available = PLACE_COLORS.find((c) => !usedColors.has(c));
    return available || PLACE_COLORS[0];
  }, [editingPlace?.groupColor, usedColors]);

  const [color, setColor] = useState(getFirstAvailableColor);
  const [tags, setTags] = useState<string[]>(editingPlace?.tags || []);
  const [tagInput, setTagInput] = useState('');

  // When editing, merge existing positions with newly selected ones
  const parcels = useMemo(() => {
    if (!editingPlace) return selectedParcels;

    // Convert existing positions to ParcelCoords
    const existingParcels = editingPlace.positions.map(parsePosition);
    // Combine existing parcels with newly selected parcels (avoid duplicates)
    const existingSet = new Set(editingPlace.positions);
    const newParcels = selectedParcels.filter(p => !existingSet.has(formatPosition(p.x, p.y)));
    return [...existingParcels, ...newParcels];
  }, [editingPlace, selectedParcels]);

  const isEditing = !!editingPlace;

  // Update selection color when color changes
  useEffect(() => {
    dispatch({ type: 'SET_SELECTION_COLOR', payload: color });
  }, [color, dispatch]);

  // Set initial selection color on mount and reset on unmount
  useEffect(() => {
    dispatch({ type: 'SET_SELECTION_COLOR', payload: color });
    return () => {
      dispatch({ type: 'SET_SELECTION_COLOR', payload: null });
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parcels.length === 0 || isSaving) return;

    setIsSaving(true);

    try {
      // Convert parcels to position strings
      const positions = parcels.map(p => formatPosition(p.x, p.y));

      if (isEditing && editingPlace) {
        const result = await updatePlace(editingPlace.id, {
          tags,
          positions,
        });
        if (result) {
          onSave();
        }
      } else {
        // Calculate base position (lowest x, then lowest y)
        const sortedParcels = [...parcels].sort((a, b) => a.x - b.x || a.y - b.y);
        const baseParcel = sortedParcels[0];
        const basePosition = formatPosition(baseParcel.x, baseParcel.y);

        const result = await createPlace({
          type: 'scene',
          basePosition,
          tags,
          positions,
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
        <label className={styles.label}>Color</label>
        <div className={styles.colorPicker}>
          {PLACE_COLORS.map((c) => {
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
          disabled={parcels.length === 0 || isSaving}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Place'}
        </button>
      </div>
    </form>
  );
}
