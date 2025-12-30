import { useState, useMemo, useEffect } from 'react';
import { useGroupsState, useGroupsDispatch } from '../../context/useGroupsHooks';
import { GroupsList } from './GroupsList';
import { GroupForm } from './GroupForm';
import { isDevMode, getDevIdentity } from '../../../../utils/devIdentity';
import type { SceneGroup } from '../../types';
import styles from './GroupsSidebar.module.css';

type SidebarMode = 'list' | 'create' | 'edit';

export function GroupsSidebar() {
  const { sidebarOpen, selectedParcels, groups, editingGroupId } = useGroupsState();
  const dispatch = useGroupsDispatch();
  const [mode, setMode] = useState<SidebarMode>('list');

  const editingGroup = useMemo(() => {
    if (mode === 'edit' && editingGroupId) {
      return groups.find((g) => g.id === editingGroupId) || null;
    }
    return null;
  }, [mode, editingGroupId, groups]);

  const handleToggle = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  const handleCreateClick = () => {
    setMode('create');
  };

  const handleEditGroup = (group: SceneGroup) => {
    dispatch({ type: 'SET_EDITING_GROUP', payload: group.id });
    setMode('edit');
  };

  const handleCancel = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_GROUP', payload: null });
  };

  const handleSave = () => {
    setMode('list');
    dispatch({ type: 'SET_EDITING_GROUP', payload: null });
  };

  const handleClearSelection = () => {
    dispatch({ type: 'CLEAR_SELECTION' });
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

  return (
    <div className={sidebarClass}>
      <button className={styles.toggleButton} onClick={handleToggle}>
        {sidebarOpen ? '>' : '<'}
      </button>

      <div className={styles.header}>
        <h3 className={styles.headerTitle}>{getTitle()}</h3>
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
          {selectedParcels.length > 0 ? (
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
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
              Click parcels on the map to select them
            </p>
          )}
        </div>
      )}
    </div>
  );
}
