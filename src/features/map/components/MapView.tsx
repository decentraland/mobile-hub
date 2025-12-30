import { useCallback } from 'react';
import { MapProvider } from '../context/MapContext';
import { GroupsProvider } from '../context/GroupsContext';
import { useGroupsState, useGroupsDispatch } from '../context/useGroupsHooks';
import { MapCanvas } from './MapCanvas';
import { MapControls } from './MapControls';
import { CoordinateDisplay } from './CoordinateDisplay';
import { SelectionOverlay } from './SelectionOverlay';
import { GroupsOverlay } from './GroupsOverlay';
import { GroupsSidebar } from './GroupsSidebar';
import { MapToolsBar } from './MapToolsBar';
import styles from '../styles/MapView.module.css';
import type { ParcelCoord } from '../types';

interface MapViewProps {
  initialCenter?: ParcelCoord;
  initialZoom?: number;
  onParcelClick?: (parcel: ParcelCoord) => void;
}

function MapViewContent({ onParcelClick }: { onParcelClick?: (parcel: ParcelCoord) => void }) {
  const { mode } = useGroupsState();
  const groupsDispatch = useGroupsDispatch();

  const handleParcelClick = useCallback(
    (parcel: ParcelCoord) => {
      // Only toggle parcel selection in groups mode
      if (mode === 'groups') {
        groupsDispatch({ type: 'TOGGLE_PARCEL_SELECTION', payload: parcel });
      }

      // Also call external handler if provided
      onParcelClick?.(parcel);
    },
    [mode, groupsDispatch, onParcelClick]
  );

  const isGroupsMode = mode === 'groups';

  return (
    <div className={styles.mapView}>
      <MapCanvas onParcelClick={handleParcelClick} />
      <GroupsOverlay />
      {isGroupsMode && <SelectionOverlay />}
      <MapControls />
      <CoordinateDisplay />
      <MapToolsBar />
      {isGroupsMode && <GroupsSidebar />}
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
