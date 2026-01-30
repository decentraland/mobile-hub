import { useMemo } from 'react';
import { usePlacesState, usePlacesDispatch, usePlacesApi } from '../../context/usePlacesHooks';
import { useMapDispatch } from '../../context/useMapHooks';
import { PlaceCard } from './PlaceCard';
import { parsePosition } from '../../utils/coordinates';
import type { Place } from '../../types';
import styles from './PlacesSidebar.module.css';

interface PlacesListProps {
  onEditPlace: (place: Place) => void;
  checkIsBanned?: (place: Place) => boolean;
  onBanToggle?: (place: Place, shouldBan: boolean) => void;
  searchQuery?: string;
}

export function PlacesList({ onEditPlace, checkIsBanned, onBanToggle, searchQuery }: PlacesListProps) {
  const { places, isLoading, error } = usePlacesState();

  // Filter to only scene places (worlds are shown on WorldsPage)
  const scenePlaces = useMemo(() => {
    return places.filter(p => p.type === 'scene');
  }, [places]);

  const filteredPlaces = useMemo(() => {
    if (!searchQuery?.trim()) return scenePlaces;
    const query = searchQuery.toLowerCase();
    return scenePlaces.filter(p => {
      const name = p.groupName || p.basePosition || '';
      return name.toLowerCase().includes(query) || p.tags.some(t => t.toLowerCase().includes(query));
    });
  }, [scenePlaces, searchQuery]);

  const dispatch = usePlacesDispatch();
  const mapDispatch = useMapDispatch();
  const { deletePlace } = usePlacesApi();

  const handleDelete = async (placeId: string) => {
    await deletePlace(placeId);
  };

  const handleClick = (place: Place) => {
    dispatch({ type: 'SET_EDITING_PLACE', payload: place.id });

    // Zoom map to show the place's parcels
    if (place.positions && place.positions.length > 0) {
      // Calculate bounding box of all parcels
      const parcels = place.positions.map(parsePosition);
      const xs = parcels.map(p => p.x);
      const ys = parcels.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Center on the middle of the bounding box
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      mapDispatch({ type: 'SET_CENTER', payload: { x: centerX, y: centerY } });
      mapDispatch({ type: 'SET_ZOOM', payload: 4 });
    } else if (place.basePosition) {
      const { x, y } = parsePosition(place.basePosition);
      mapDispatch({ type: 'SET_CENTER', payload: { x, y } });
      mapDispatch({ type: 'SET_ZOOM', payload: 4 });
    }
  };

  if (isLoading && scenePlaces.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText}>Loading places...</p>
      </div>
    );
  }

  if (error && scenePlaces.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText} style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      </div>
    );
  }

  if (scenePlaces.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>&#9633;</div>
        <p className={styles.emptyStateText}>
          No places yet. Click parcels on the map to select them, then create a place.
        </p>
      </div>
    );
  }

  if (filteredPlaces.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText}>
          No places match your search.
        </p>
      </div>
    );
  }

  return (
    <div>
      {filteredPlaces.map((place) => (
        <PlaceCard
          key={place.id}
          place={place}
          onEdit={onEditPlace}
          onDelete={handleDelete}
          onClick={handleClick}
          isBanned={checkIsBanned?.(place) ?? false}
          onBanToggle={onBanToggle}
        />
      ))}
    </div>
  );
}
