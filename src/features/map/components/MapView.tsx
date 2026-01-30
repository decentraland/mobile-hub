import { useCallback, useState } from 'react';
import { MapProvider } from '../context/MapContext';
import { PlacesProvider } from '../context/PlacesContext';
import { usePlacesState, usePlacesDispatch, usePlacesApi } from '../context/usePlacesHooks';
import { useMapDispatch } from '../context/useMapHooks';
import { useBansApi, useBansState } from '../context/useBansHooks';
import { MapCanvas } from './MapCanvas';
import { MapControls } from './MapControls';
import { CoordinateDisplay } from './CoordinateDisplay';
import { SelectionOverlay } from './SelectionOverlay';
import { PlacesOverlay } from './PlacesOverlay';
import { PlacesSidebar } from './PlacesSidebar';
import { BannedScenesSidebar } from './BannedScenesSidebar';
import { FloatingActionButton } from './FloatingActionButton';
import { PlaceDetailSidebar } from './PlaceDetailSidebar';
import { SceneHighlightOverlay } from './SceneHighlightOverlay';
import { formatPosition, parsePosition, coordsToPositions } from '../utils/coordinates';
import styles from '../styles/MapView.module.css';
import type { ParcelCoord, Place } from '../types';
import type { Ban } from '../api/bansApi';
import type { SceneInfo } from '../api/sceneApi';

interface MapViewProps {
  initialCenter?: ParcelCoord;
  initialZoom?: number;
  onParcelClick?: (parcel: ParcelCoord) => void;
}

type InteractionMode = 'view' | 'select';

// Track what's selected for the detail sidebar
type SelectedItem =
  | { type: 'parcel'; parcel: ParcelCoord; place?: Place }
  | null;

type SidebarMode = 'list' | 'create' | 'edit';

function MapViewContent({ onParcelClick }: { onParcelClick?: (parcel: ParcelCoord) => void }) {
  const { places, placeGroups, sidebarOpen } = usePlacesState();
  const placesDispatch = usePlacesDispatch();
  const mapDispatch = useMapDispatch();
  const { updatePlace, createPlace, setPlaceGroup, removePlaceGroup, createPlaceGroup } = usePlacesApi();
  const { checkPlaceBanned, checkSceneBanned, getPlaceBan, getSceneBan, togglePlaceBan, banScene, unbanScene } = useBansApi();
  const { bans } = useBansState();
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('view');
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [highlightedParcels, setHighlightedParcels] = useState<ParcelCoord[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('list');
  const [bansSidebarOpen, setBansSidebarOpen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isBanning, setIsBanning] = useState(false);

  // Find which place a parcel belongs to
  const findPlaceByParcel = useCallback(
    (parcel: ParcelCoord): Place | null => {
      const positionStr = formatPosition(parcel.x, parcel.y);
      return places.find(p =>
        p.type === 'scene' && p.positions.includes(positionStr)
      ) || null;
    },
    [places]
  );

  // Check if a place is a temporary/unsaved one
  const isTemporaryPlace = useCallback((place?: Place): boolean => {
    return place?.id.startsWith('temp-') ?? false;
  }, []);

  // Check if a place or scene is banned (wrapper for PlaceDetailSidebar)
  const checkIsBanned = useCallback((place?: Place, parcels?: ParcelCoord[]): boolean => {
    if (place && !isTemporaryPlace(place)) {
      return checkPlaceBanned(place.id);
    }
    // For temporary places or raw parcels, check by positions
    const checkPositions = place?.positions || (parcels ? coordsToPositions(parcels) : []);
    if (checkPositions.length > 0) {
      return checkSceneBanned(checkPositions);
    }
    return false;
  }, [checkPlaceBanned, checkSceneBanned, isTemporaryPlace]);

  // Get ban info for a place or scene (wrapper for PlaceDetailSidebar)
  const getBanInfo = useCallback((place?: Place, parcels?: ParcelCoord[]) => {
    if (place && !isTemporaryPlace(place)) {
      return getPlaceBan(place.id);
    }
    // For temporary places or raw parcels, get by positions
    const checkPositions = place?.positions || (parcels ? coordsToPositions(parcels) : []);
    if (checkPositions.length > 0) {
      return getSceneBan(checkPositions);
    }
    return undefined;
  }, [getPlaceBan, getSceneBan, isTemporaryPlace]);

  // Handle ban toggle (wrapper for PlaceDetailSidebar)
  const handleBanToggle = useCallback(async (shouldBan: boolean, sceneId?: string) => {
    const place = selectedItem?.type === 'parcel' ? selectedItem.place : undefined;

    setIsBanning(true);
    try {
      if (place && !isTemporaryPlace(place)) {
        // For saved places, use place-based banning
        await togglePlaceBan(place, shouldBan, sceneId);
      } else {
        // For temporary places or raw parcels, use position-based banning
        const positions = place?.positions || coordsToPositions(highlightedParcels);
        if (positions.length > 0) {
          if (shouldBan) {
            await banScene(positions, sceneId);
          } else {
            await unbanScene(positions);
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle ban:', err);
    } finally {
      setIsBanning(false);
    }
  }, [selectedItem, highlightedParcels, togglePlaceBan, banScene, unbanScene, isTemporaryPlace]);

  const handleParcelClick = useCallback(
    (parcel: ParcelCoord) => {
      if (interactionMode === 'select') {
        // In select mode, toggle parcel selection
        placesDispatch({ type: 'TOGGLE_PARCEL_SELECTION', payload: parcel });
      } else {
        // In view mode, open detail sidebar with the clicked parcel
        // Also include the place if this parcel belongs to one
        const existingPlace = findPlaceByParcel(parcel);

        // If no existing place, create a temporary one for display purposes
        const place: Place = existingPlace || {
          id: `temp-${parcel.x}-${parcel.y}`,
          type: 'scene',
          basePosition: formatPosition(parcel.x, parcel.y),
          worldName: null,
          sceneId: null,
          groupId: null,
          groupName: null,
          groupColor: null,
          tags: [],
          positions: [formatPosition(parcel.x, parcel.y)],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        setSelectedItem({ type: 'parcel', parcel, place });
      }

      // Also call external handler if provided
      onParcelClick?.(parcel);
    },
    [interactionMode, placesDispatch, findPlaceByParcel, onParcelClick]
  );

  const handleLayersClick = () => {
    // Close detail sidebar and bans sidebar if open
    setSelectedItem(null);
    setHighlightedParcels([]);
    setBansSidebarOpen(false);
    // Reset to list mode and toggle the places sidebar
    setSidebarMode('list');
    placesDispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  const handleBansClick = () => {
    // Close detail sidebar and places sidebar if open
    setSelectedItem(null);
    setHighlightedParcels([]);
    placesDispatch({ type: 'SET_SIDEBAR_OPEN', payload: false });
    // Toggle the bans sidebar
    setBansSidebarOpen(!bansSidebarOpen);
  };

  const handleCloseBansSidebar = () => {
    setBansSidebarOpen(false);
  };

  const handleBanClick = useCallback((ban: Ban) => {
    // Skip world bans - they don't have parcel coordinates
    if (ban.worldName) return;

    // For place bans, find the place and center on its first parcel
    if (ban.placeId) {
      const place = places.find(p => p.id === ban.placeId);
      if (place && place.positions.length > 0) {
        // Calculate center of the place's parcels
        const parcels = place.positions.map(parsePosition);
        const avgX = parcels.reduce((sum, p) => sum + p.x, 0) / parcels.length;
        const avgY = parcels.reduce((sum, p) => sum + p.y, 0) / parcels.length;
        mapDispatch({ type: 'SET_CENTER', payload: { x: avgX, y: avgY } });
        mapDispatch({ type: 'SET_ZOOM', payload: 8 });
      }
      return;
    }

    // For scene bans, center on the positions
    if (ban.positions.length > 0) {
      const parcels = ban.positions.map(parsePosition);
      const avgX = parcels.reduce((sum, p) => sum + p.x, 0) / parcels.length;
      const avgY = parcels.reduce((sum, p) => sum + p.y, 0) / parcels.length;
      mapDispatch({ type: 'SET_CENTER', payload: { x: avgX, y: avgY } });
      mapDispatch({ type: 'SET_ZOOM', payload: 8 });
    }
  }, [places, mapDispatch]);

  const handleCloseDetailSidebar = () => {
    setSelectedItem(null);
    setHighlightedParcels([]);
  };

  // Handle when scene info is loaded - update highlighted parcels and temporary place
  const handleSceneInfoLoaded = useCallback((sceneInfo: SceneInfo) => {
    // Highlight all parcels of the scene
    setHighlightedParcels(sceneInfo.parcels);

    // Update the temporary place with all positions from the scene
    setSelectedItem(prev => {
      if (!prev || prev.type !== 'parcel' || !prev.place) return prev;
      // Only update if it's a temporary place
      if (!prev.place.id.startsWith('temp-')) return prev;
      return {
        ...prev,
        place: {
          ...prev.place,
          positions: coordsToPositions(sceneInfo.parcels),
          sceneId: sceneInfo.entityId,
          basePosition: sceneInfo.baseParcel
            ? formatPosition(sceneInfo.baseParcel.x, sceneInfo.baseParcel.y)
            : prev.place.basePosition,
        }
      };
    });
  }, []);

  const handleViewPlace = useCallback((placeId: string) => {
    // Close the detail sidebar
    setSelectedItem(null);
    setHighlightedParcels([]);
    // Set the place for editing and open the sidebar in edit mode
    placesDispatch({ type: 'SET_EDITING_PLACE', payload: placeId });
    setSidebarMode('edit');
    placesDispatch({ type: 'SET_SIDEBAR_OPEN', payload: true });
  }, [placesDispatch]);

  // Handle updating tags for an existing place
  const handleUpdatePlaceTags = useCallback(async (placeId: string, tags: string[]) => {
    await updatePlace(placeId, { tags });
  }, [updatePlace]);

  // Handle creating a new place from a temporary place (when saving tags)
  const handleCreatePlaceWithTags = useCallback(async (_placeId: string, tags: string[]) => {
    if (!selectedItem || selectedItem.type !== 'parcel' || !selectedItem.place) return;
    const place = selectedItem.place;
    if (!isTemporaryPlace(place)) return;

    // Create a new place with the scene's positions and tags
    const basePosition = place.basePosition || place.positions[0];
    const newPlace = await createPlace({
      type: 'scene',
      basePosition,
      tags,
      positions: place.positions,
    });

    if (newPlace) {
      // Update the selected item with the new saved place
      setSelectedItem({
        type: 'parcel',
        parcel: selectedItem.parcel,
        place: newPlace
      });
    }
  }, [selectedItem, isTemporaryPlace, createPlace]);

  // Handle assigning a place to a group (for saved places)
  const handleAssignToGroup = useCallback(async (placeId: string, groupId: string) => {
    const updatedPlace = await setPlaceGroup(placeId, groupId);
    if (!updatedPlace) return;
    // Update the selected item with the new place data
    setSelectedItem(prev => {
      if (!prev || prev.type !== 'parcel' || prev.place?.id !== placeId) return prev;
      return { ...prev, place: updatedPlace };
    });
  }, [setPlaceGroup]);

  // Handle assigning a temporary place to a group (creates place first, then assigns)
  const handleAssignTemporaryToGroup = useCallback(async (_placeId: string, groupId: string) => {
    if (!selectedItem || selectedItem.type !== 'parcel' || !selectedItem.place) return;
    const place = selectedItem.place;
    if (!isTemporaryPlace(place)) return;

    // Create the place first
    const basePosition = place.basePosition || place.positions[0];
    const newPlace = await createPlace({
      type: 'scene',
      basePosition,
      groupId, // Assign to group during creation
      tags: [],
      positions: place.positions,
    });

    if (newPlace) {
      // Update the selected item with the new saved place
      setSelectedItem({
        type: 'parcel',
        parcel: selectedItem.parcel,
        place: newPlace
      });
    }
  }, [selectedItem, isTemporaryPlace, createPlace]);

  // Handle removing a place from its group
  const handleRemoveFromGroup = useCallback(async (placeId: string) => {
    const updatedPlace = await removePlaceGroup(placeId);
    if (!updatedPlace) return;
    // Update the selected item with the new place data
    setSelectedItem(prev => {
      if (!prev || prev.type !== 'parcel' || prev.place?.id !== placeId) return prev;
      return { ...prev, place: updatedPlace };
    });
  }, [removePlaceGroup]);

  // Handle creating a new group and assigning the current scene to it
  const handleCreateGroupAndAssign = useCallback(async (name: string, color: string) => {
    if (!selectedItem || selectedItem.type !== 'parcel' || !selectedItem.place) return;
    const place = selectedItem.place;

    // Create the group first
    const newGroup = await createPlaceGroup({ name, color, description: '' });
    if (!newGroup) return;

    if (isTemporaryPlace(place)) {
      // For temporary places: create the place with the group assignment
      const basePosition = place.basePosition || place.positions[0];
      const newPlace = await createPlace({
        type: 'scene',
        basePosition,
        groupId: newGroup.id,
        tags: [],
        positions: place.positions,
      });
      if (newPlace) {
        setSelectedItem({
          type: 'parcel',
          parcel: selectedItem.parcel,
          place: newPlace
        });
      }
    } else {
      // For saved places: just assign to the group
      const updatedPlace = await setPlaceGroup(place.id, newGroup.id);
      if (updatedPlace) {
        setSelectedItem({
          type: 'parcel',
          parcel: selectedItem.parcel,
          place: updatedPlace
        });
      }
    }
  }, [selectedItem, isTemporaryPlace, createPlaceGroup, createPlace, setPlaceGroup]);

  // Check if a place is banned (simplified for PlacesSidebar)
  const checkPlaceIsBanned = useCallback((place: Place): boolean => {
    return checkPlaceBanned(place.id);
  }, [checkPlaceBanned]);

  // Handle ban toggle for a place (simplified for PlacesSidebar)
  const handlePlaceBanToggle = useCallback(async (place: Place, shouldBan: boolean) => {
    try {
      await togglePlaceBan(place, shouldBan);
    } catch (err) {
      console.error('Failed to toggle place ban:', err);
    }
  }, [togglePlaceBan]);

  const isSelectMode = interactionMode === 'select';
  const showDetailSidebar = selectedItem !== null && !isSelectMode;

  // Get current place for PlaceDetailSidebar
  const currentPlace = selectedItem?.type === 'parcel' ? selectedItem.place : undefined;

  return (
    <div className={styles.mapView}>
      <MapCanvas onParcelClick={handleParcelClick} />
      <PlacesOverlay visible={overlayVisible} />
      {isSelectMode && <SelectionOverlay />}
      {highlightedParcels.length > 0 && <SceneHighlightOverlay parcels={highlightedParcels} />}
      <MapControls />
      <CoordinateDisplay />
      {sidebarOpen && (
        <PlacesSidebar
          onExitSelectMode={() => {
            setInteractionMode('view');
            setSidebarMode('list');
          }}
          onEnterSelectMode={() => setInteractionMode('select')}
          isSelectMode={isSelectMode}
          initialMode={sidebarMode}
          checkIsBanned={checkPlaceIsBanned}
          onBanToggle={handlePlaceBanToggle}
        />
      )}
      {showDetailSidebar && currentPlace && (
        <PlaceDetailSidebar
          place={currentPlace}
          onClose={handleCloseDetailSidebar}
          isBanned={checkIsBanned(currentPlace)}
          ban={getBanInfo(currentPlace)}
          onBanToggle={handleBanToggle}
          isBanning={isBanning}
          onUpdateTags={isTemporaryPlace(currentPlace) ? handleCreatePlaceWithTags : handleUpdatePlaceTags}
          onViewGroup={isTemporaryPlace(currentPlace) ? undefined : handleViewPlace}
          onAssignToGroup={isTemporaryPlace(currentPlace) ? handleAssignTemporaryToGroup : handleAssignToGroup}
          onRemoveFromGroup={isTemporaryPlace(currentPlace) ? undefined : handleRemoveFromGroup}
          onCreateGroupAndAssign={handleCreateGroupAndAssign}
          availableGroups={placeGroups}
          onSceneInfoLoaded={isTemporaryPlace(currentPlace) ? handleSceneInfoLoaded : undefined}
        />
      )}
      <BannedScenesSidebar
        isOpen={bansSidebarOpen}
        onClose={handleCloseBansSidebar}
        onBanClick={handleBanClick}
      />
      <FloatingActionButton
        onGroupsClick={handleLayersClick}
        onBansClick={handleBansClick}
        onToggleOverlay={() => setOverlayVisible(!overlayVisible)}
        overlayVisible={overlayVisible}
        groupCount={places.filter(p => p.type === 'scene').length}
        banCount={bans.filter(b => !b.worldName).length}
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
      <PlacesProvider>
        <MapViewContent onParcelClick={onParcelClick} />
      </PlacesProvider>
    </MapProvider>
  );
}
