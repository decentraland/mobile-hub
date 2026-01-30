import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePlacesState, usePlacesDispatch } from '../../context/usePlacesHooks';
import { PlacesList } from './PlacesList';
import { PlaceForm } from './PlaceForm';
import type { Place } from '../../types';
import styles from './PlacesSidebar.module.css';

type SidebarMode = 'list' | 'create' | 'edit';

interface PlacesSidebarProps {
  onExitSelectMode?: () => void;
  onEnterSelectMode?: () => void;
  isSelectMode?: boolean;
  initialMode?: SidebarMode;
  checkIsBanned?: (place: Place) => boolean;
  onBanToggle?: (place: Place, shouldBan: boolean) => void;
}

export function PlacesSidebar({ onExitSelectMode, onEnterSelectMode, isSelectMode = false, initialMode = 'list', checkIsBanned, onBanToggle }: PlacesSidebarProps) {
  const { sidebarOpen, selectedParcels, places, editingPlaceId } = usePlacesState();
  const dispatch = usePlacesDispatch();
  const [mode, setMode] = useState<SidebarMode>(initialMode);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync mode when initialMode changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Handle Escape key to close sidebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dispatch({ type: 'SET_SIDEBAR_OPEN', payload: false });
      onExitSelectMode?.();
    }
  }, [dispatch, onExitSelectMode])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const editingPlace = useMemo(() => {
    if (mode === 'edit' && editingPlaceId) {
      return places.find((p) => p.id === editingPlaceId) || null;
    }
    return null;
  }, [mode, editingPlaceId, places]);

  const handleToggle = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
    // If closing sidebar, exit select mode
    if (sidebarOpen && onExitSelectMode) {
      onExitSelectMode();
    }
  };

  const handleCreateClick = () => {
    setMode('create');
    // Enter select mode so user can select parcels
    onEnterSelectMode?.();
  };

  const handleEditPlace = (place: Place) => {
    dispatch({ type: 'SET_EDITING_PLACE', payload: place.id });
    setMode('edit');
    // Enter select mode so user can add more parcels
    onEnterSelectMode?.();
  };

  const handleCancel = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_PLACE', payload: null });
    dispatch({ type: 'CLEAR_SELECTION' });
    onExitSelectMode?.();
  };

  const handleSave = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_PLACE', payload: null });
    dispatch({ type: 'CLEAR_SELECTION' });
    onExitSelectMode?.();
  };

  const handleClearSelection = () => {
    dispatch({ type: 'CLEAR_SELECTION' });
  };

  const handleSelectParcels = () => {
    onEnterSelectMode?.();
  };

  const handleStopSelecting = () => {
    onExitSelectMode?.();
  };

  const sidebarClass = `${styles.sidebar} ${!sidebarOpen ? styles.sidebarCollapsed : ''}`;

  const getTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create Place';
      case 'edit':
        return 'Edit Place';
      default:
        return 'Places';
    }
  };

  const sidebarContent = (
    <div className={sidebarClass}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>{getTitle()}</h3>
        <button className={styles.closeButton} onClick={handleToggle}>
          ×
        </button>
      </div>

      <div className={styles.content}>
        {mode === 'list' && (
          <>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search places..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {selectedParcels.length > 0 && (
              <div className={styles.selectionInfo}>
                <p className={styles.selectionInfoText}>
                  {selectedParcels.length} parcel{selectedParcels.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
            <PlacesList onEditPlace={handleEditPlace} checkIsBanned={checkIsBanned} onBanToggle={onBanToggle} searchQuery={searchQuery} />
          </>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <PlaceForm
            editingPlace={editingPlace}
            selectedParcels={selectedParcels}
            onCancel={handleCancel}
            onSave={handleSave}
          />
        )}
      </div>

      {mode === 'list' && (
        <div className={styles.footer}>
          {isSelectMode ? (
            selectedParcels.length > 0 ? (
              <>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={handleClearSelection}
                >
                  Clear
                </button>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleCreateClick}
                >
                  Create Place
                </button>
              </>
            ) : (
              <>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={handleStopSelecting}
                >
                  Done
                </button>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0, flex: 1 }}>
                  Click parcels to select
                </p>
              </>
            )
          ) : (
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={handleSelectParcels}
              style={{ width: '100%' }}
            >
              Select Parcels
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Use portal to render at body level, avoiding stacking context issues
  return createPortal(sidebarContent, document.body);
}
