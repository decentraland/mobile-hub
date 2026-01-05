import { useCallback, useState } from 'react';
import { MapProvider } from '../context/MapContext';
import { GroupsProvider } from '../context/GroupsContext';
import { useGroupsState, useGroupsDispatch, useGroupsApi } from '../context/useGroupsHooks';
import { useBansApi } from '../context/useBansHooks';
import { MapCanvas } from './MapCanvas';
import { MapControls } from './MapControls';
import { CoordinateDisplay } from './CoordinateDisplay';
import { SelectionOverlay } from './SelectionOverlay';
import { GroupsOverlay } from './GroupsOverlay';
import { GroupsSidebar } from './GroupsSidebar';
import { FloatingActionButton } from './FloatingActionButton';
import { SceneDetailSidebar } from './SceneDetailSidebar';
import { SceneHighlightOverlay } from './SceneHighlightOverlay';
import styles from '../styles/MapView.module.css';
import type { ParcelCoord, SceneGroup } from '../types';

interface MapViewProps {
  initialCenter?: ParcelCoord;
  initialZoom?: number;
  onParcelClick?: (parcel: ParcelCoord) => void;
}

type InteractionMode = 'view' | 'select';

// Track what's selected for the detail sidebar
type SelectedItem =
  | { type: 'parcel'; parcel: ParcelCoord; group?: SceneGroup }
  | null;

type SidebarMode = 'list' | 'create' | 'edit';

function MapViewContent({ onParcelClick }: { onParcelClick?: (parcel: ParcelCoord) => void }) {
  const { groups, sidebarOpen } = useGroupsState();
  const groupsDispatch = useGroupsDispatch();
  const { updateGroup, deleteGroup } = useGroupsApi();
  const { checkGroupBanned, checkSceneBanned, toggleBan } = useBansApi();
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('view');
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [highlightedParcels, setHighlightedParcels] = useState<ParcelCoord[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('list');

  // Find which group a parcel belongs to
  const findGroupByParcel = useCallback(
    (parcel: ParcelCoord): SceneGroup | null => {
      return groups.find(g =>
        g.parcels.some(p => p.x === parcel.x && p.y === parcel.y)
      ) || null;
    },
    [groups]
  );

  // Check if a group or scene is banned (wrapper for SceneDetailSidebar)
  const checkIsBanned = useCallback((targetGroup?: SceneGroup, parcels?: ParcelCoord[]): boolean => {
    if (targetGroup) {
      return checkGroupBanned(targetGroup.id);
    }
    if (parcels && parcels.length > 0) {
      return checkSceneBanned(parcels);
    }
    return false;
  }, [checkGroupBanned, checkSceneBanned]);

  // Handle ban toggle (wrapper for SceneDetailSidebar)
  const handleBanToggle = useCallback(async (shouldBan: boolean, targetGroup?: SceneGroup, parcels?: ParcelCoord[]) => {
    try {
      await toggleBan(targetGroup, parcels, shouldBan);
    } catch (err) {
      console.error('Failed to toggle ban:', err);
    }
  }, [toggleBan]);

  const handleParcelClick = useCallback(
    (parcel: ParcelCoord) => {
      if (interactionMode === 'select') {
        // In select mode, toggle parcel selection
        groupsDispatch({ type: 'TOGGLE_PARCEL_SELECTION', payload: parcel });
      } else {
        // In view mode, open detail sidebar with the clicked parcel
        // Also include the group if this parcel belongs to one
        const group = findGroupByParcel(parcel);
        setSelectedItem({ type: 'parcel', parcel, group: group || undefined });
      }

      // Also call external handler if provided
      onParcelClick?.(parcel);
    },
    [interactionMode, groupsDispatch, findGroupByParcel, onParcelClick]
  );

  const handleLayersClick = () => {
    // Close detail sidebar if open
    setSelectedItem(null);
    setHighlightedParcels([]);
    // Reset to list mode and toggle the groups sidebar
    setSidebarMode('list');
    groupsDispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  const handleCloseDetailSidebar = () => {
    setSelectedItem(null);
    setHighlightedParcels([]);
  };

  const handleSceneLoaded = useCallback((parcels: ParcelCoord[]) => {
    setHighlightedParcels(parcels);
  }, []);

  const handleCreateGroupFromScene = useCallback((parcels: ParcelCoord[], _name: string) => {
    // Close the detail sidebar
    setSelectedItem(null);
    setHighlightedParcels([]);
    // Set the parcels as selected
    groupsDispatch({ type: 'SET_SELECTED_PARCELS', payload: parcels });
    // Enter select mode and open the groups sidebar in create mode
    setInteractionMode('select');
    setSidebarMode('create');
    groupsDispatch({ type: 'SET_SIDEBAR_OPEN', payload: true });
  }, [groupsDispatch]);

  // Get all parcels that are already in any group
  const getParcelsInGroups = useCallback((): Set<string> => {
    const parcelsInGroups = new Set<string>();
    groups.forEach(g => {
      g.parcels.forEach(p => parcelsInGroups.add(`${p.x},${p.y}`));
    });
    return parcelsInGroups;
  }, [groups]);

  const handleAddToExistingGroup = useCallback(async (parcels: ParcelCoord[], groupId: string) => {
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup) return;

    // Get all parcels already in ANY group
    const parcelsInGroups = getParcelsInGroups();

    // Filter to only parcels not in any group (except the target group itself)
    const targetGroupParcels = new Set(targetGroup.parcels.map(p => `${p.x},${p.y}`));
    const freeParcels = parcels.filter(p => {
      const key = `${p.x},${p.y}`;
      // Allow if not in any group, or already in target group
      return !parcelsInGroups.has(key) || targetGroupParcels.has(key);
    });

    if (freeParcels.length === 0) {
      // All parcels already belong to other groups
      return;
    }

    // Merge with existing parcels in target group
    const mergedParcels = [...targetGroup.parcels];
    freeParcels.forEach(p => {
      if (!targetGroupParcels.has(`${p.x},${p.y}`)) {
        mergedParcels.push(p);
      }
    });

    const updatedGroup = await updateGroup(groupId, { parcels: mergedParcels });

    // Update the selected item to reflect the new group association
    if (selectedItem && updatedGroup) {
      setSelectedItem({ ...selectedItem, group: updatedGroup });
    }
  }, [groups, updateGroup, getParcelsInGroups, selectedItem]);

  const handleRemoveFromGroup = useCallback(async (parcels: ParcelCoord[], groupId: string) => {
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup) return;

    // Remove the specified parcels from the group
    const parcelsToRemove = new Set(parcels.map(p => `${p.x},${p.y}`));
    const remainingParcels = targetGroup.parcels.filter(p => !parcelsToRemove.has(`${p.x},${p.y}`));

    if (remainingParcels.length === 0) {
      // If no parcels left, delete the group
      await deleteGroup(groupId);
    } else {
      await updateGroup(groupId, { parcels: remainingParcels });
    }

    // Update the selected item to remove the group association
    if (selectedItem) {
      setSelectedItem({ ...selectedItem, group: undefined });
    }
  }, [groups, updateGroup, deleteGroup, selectedItem]);

  const handleViewGroup = useCallback((group: SceneGroup) => {
    // Close the detail sidebar
    setSelectedItem(null);
    setHighlightedParcels([]);
    // Set the group for editing and open the sidebar in edit mode
    groupsDispatch({ type: 'SET_EDITING_GROUP', payload: group.id });
    setSidebarMode('edit');
    groupsDispatch({ type: 'SET_SIDEBAR_OPEN', payload: true });
  }, [groupsDispatch]);

  // Check if a group is banned (simplified for GroupsSidebar)
  const checkGroupIsBanned = useCallback((group: SceneGroup): boolean => {
    return checkGroupBanned(group.id);
  }, [checkGroupBanned]);

  // Handle ban toggle for a group (simplified for GroupsSidebar)
  const handleGroupBanToggle = useCallback(async (group: SceneGroup, shouldBan: boolean) => {
    try {
      await toggleBan(group, undefined, shouldBan);
    } catch (err) {
      console.error('Failed to toggle group ban:', err);
    }
  }, [toggleBan]);

  const isSelectMode = interactionMode === 'select';
  const showDetailSidebar = selectedItem !== null && !isSelectMode;

  return (
    <div className={styles.mapView}>
      <MapCanvas onParcelClick={handleParcelClick} />
      <GroupsOverlay />
      {isSelectMode && <SelectionOverlay />}
      {highlightedParcels.length > 0 && <SceneHighlightOverlay parcels={highlightedParcels} />}
      <MapControls />
      <CoordinateDisplay />
      {sidebarOpen && (
        <GroupsSidebar
          onExitSelectMode={() => {
            setInteractionMode('view');
            setSidebarMode('list');
          }}
          onEnterSelectMode={() => setInteractionMode('select')}
          isSelectMode={isSelectMode}
          initialMode={sidebarMode}
          checkIsBanned={checkGroupIsBanned}
          onBanToggle={handleGroupBanToggle}
        />
      )}
      {showDetailSidebar && (
        <SceneDetailSidebar
          parcel={selectedItem.parcel}
          group={selectedItem.group}
          onClose={handleCloseDetailSidebar}
          checkIsBanned={checkIsBanned}
          onBanToggle={handleBanToggle}
          onSceneLoaded={handleSceneLoaded}
          onCreateGroup={handleCreateGroupFromScene}
          onAddToGroup={handleAddToExistingGroup}
          onRemoveFromGroup={handleRemoveFromGroup}
          onViewGroup={handleViewGroup}
          existingGroups={groups}
        />
      )}
      <FloatingActionButton
        onClick={handleLayersClick}
        groupCount={groups.length}
      />
    </div>
  );
}

export function MapView({
  initialCenter,
  initialZoom,
  onParcelClick,
}: MapViewProps) {
  return (
    <MapProvider initialCenter={initialCenter} initialZoom={initialZoom}>
      <GroupsProvider>
        <MapViewContent onParcelClick={onParcelClick} />
      </GroupsProvider>
    </MapProvider>
  );
}
