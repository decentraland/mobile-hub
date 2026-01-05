import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGroupsState, useGroupsDispatch } from '../../context/useGroupsHooks';
import { GroupsList } from './GroupsList';
import { GroupForm } from './GroupForm';
import type { SceneGroup } from '../../types';
import styles from './GroupsSidebar.module.css';

type SidebarMode = 'list' | 'create' | 'edit';

interface GroupsSidebarProps {
  onExitSelectMode?: () => void;
  onEnterSelectMode?: () => void;
  isSelectMode?: boolean;
  initialMode?: SidebarMode;
}

export function GroupsSidebar({ onExitSelectMode, onEnterSelectMode, isSelectMode = false, initialMode = 'list' }: GroupsSidebarProps) {
  const { sidebarOpen, selectedParcels, groups, editingGroupId } = useGroupsState();
  const dispatch = useGroupsDispatch();
  const [mode, setMode] = useState<SidebarMode>(initialMode);

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

  const editingGroup = useMemo(() => {
    if (mode === 'edit' && editingGroupId) {
      return groups.find((g) => g.id === editingGroupId) || null;
    }
    return null;
  }, [mode, editingGroupId, groups]);

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

  const handleEditGroup = (group: SceneGroup) => {
    dispatch({ type: 'SET_EDITING_GROUP', payload: group.id });
    setMode('edit');
    // Enter select mode so user can add more parcels
    onEnterSelectMode?.();
  };

  const handleCancel = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_GROUP', payload: null });
    dispatch({ type: 'CLEAR_SELECTION' });
    onExitSelectMode?.();
  };

  const handleSave = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_GROUP', payload: null });
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
        return 'Create Group';
      case 'edit':
        return 'Edit Group';
      default:
        return 'Scene Groups';
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
            {selectedParcels.length > 0 && (
              <div className={styles.selectionInfo}>
                <p className={styles.selectionInfoText}>
                  {selectedParcels.length} parcel{selectedParcels.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
            <GroupsList onEditGroup={handleEditGroup} />
          </>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <GroupForm
            editingGroup={editingGroup}
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
                  Create Group
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
