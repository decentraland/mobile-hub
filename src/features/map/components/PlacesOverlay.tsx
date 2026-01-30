import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { usePlacesState } from '../context/usePlacesHooks';
import { useBansState } from '../context/useBansHooks';
import { parcelToScreen, parsePosition } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { Place, ParcelCoord } from '../types';

const DEFAULT_PLACE_COLOR = '#6366f1'; // indigo
const PLACE_FILL_OPACITY = 0.15;
const PLACE_STROKE_WIDTH = 2;
const EDITING_STROKE_WIDTH = 3;
const BANNED_COLOR = '#FF4444';
const BANNED_STROKE_WIDTH = 2.5;

interface PlaceBorderData {
  id: string;
  path: string;
  color: string;
  isEditing: boolean;
  isBanned: boolean;
}

interface PlacesOverlayProps {
  visible?: boolean;
}

/**
 * Calculate the border path for a set of parcels.
 */
function calculateBorderPath(
  parcels: ParcelCoord[],
  viewport: { centerX: number; centerY: number; width: number; height: number; zoom: number },
  pixelsPerParcel: number
): string {
  if (parcels.length === 0) return '';

  const parcelSet = new Set(parcels.map(p => `${p.x},${p.y}`));
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const parcel of parcels) {
    const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
    const top = screenY - pixelsPerParcel;
    const bottom = screenY;
    const left = screenX;
    const right = screenX + pixelsPerParcel;

    if (!parcelSet.has(`${parcel.x},${parcel.y + 1}`)) {
      edges.push({ x1: left, y1: top, x2: right, y2: top });
    }
    if (!parcelSet.has(`${parcel.x},${parcel.y - 1}`)) {
      edges.push({ x1: left, y1: bottom, x2: right, y2: bottom });
    }
    if (!parcelSet.has(`${parcel.x - 1},${parcel.y}`)) {
      edges.push({ x1: left, y1: top, x2: left, y2: bottom });
    }
    if (!parcelSet.has(`${parcel.x + 1},${parcel.y}`)) {
      edges.push({ x1: right, y1: top, x2: right, y2: bottom });
    }
  }

  if (edges.length === 0) return '';
  return edges.map(e => `M${e.x1},${e.y1}L${e.x2},${e.y2}`).join('');
}

/**
 * Calculate a filled polygon path for a set of parcels.
 */
function calculateFillPath(
  parcels: ParcelCoord[],
  viewport: { centerX: number; centerY: number; width: number; height: number; zoom: number },
  pixelsPerParcel: number
): string {
  if (parcels.length === 0) return '';

  return parcels.map(parcel => {
    const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
    const top = screenY - pixelsPerParcel;
    const left = screenX;
    return `M${left},${top}h${pixelsPerParcel}v${pixelsPerParcel}h${-pixelsPerParcel}Z`;
  }).join('');
}

/**
 * Check if any parcel in the list is visible in the viewport
 */
function hasVisibleParcels(
  parcels: ParcelCoord[],
  viewport: { centerX: number; centerY: number; width: number; height: number; zoom: number },
  pixelsPerParcel: number
): boolean {
  const halfWidth = viewport.width / 2 / pixelsPerParcel;
  const halfHeight = viewport.height / 2 / pixelsPerParcel;
  const minX = viewport.centerX - halfWidth - 1;
  const maxX = viewport.centerX + halfWidth + 1;
  const minY = viewport.centerY - halfHeight - 1;
  const maxY = viewport.centerY + halfHeight + 1;

  return parcels.some(p =>
    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  );
}

/**
 * Get the parcels for a place (for scenes, converts positions to ParcelCoord; for worlds, empty)
 */
function getPlaceParcels(place: Place): ParcelCoord[] {
  if (place.type === 'world') {
    return []; // Worlds don't have map parcels
  }
  // For scenes, use positions array if available
  if (place.positions && place.positions.length > 0) {
    return place.positions.map(parsePosition);
  }
  // Otherwise use base position
  if (place.basePosition) {
    return [parsePosition(place.basePosition)];
  }
  return [];
}

export function PlacesOverlay({ visible = true }: PlacesOverlayProps) {
  const { viewport } = useMapState();
  const { places, editingPlaceId } = usePlacesState();
  const { bans } = useBansState();

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  // Get scene bans (bans with positions but no groupId, worldName, or placeId)
  const sceneBans = useMemo(() => {
    return bans.filter(ban =>
      ban.groupId === null &&
      ban.worldName === null &&
      ban.placeId === null &&
      ban.positions.length > 0
    );
  }, [bans]);

  // Get place bans
  const placeBanIds = useMemo(() => {
    return new Set(bans.filter(ban => ban.placeId !== null).map(ban => ban.placeId));
  }, [bans]);

  const placeBorders = useMemo(() => {
    if (!visible) return [];

    const borders: PlaceBorderData[] = [];

    // Add place borders (only for scene places with visible parcels)
    places.forEach((place: Place) => {
      const parcels = getPlaceParcels(place);
      if (parcels.length === 0) return; // Skip worlds or places without parcels

      if (!hasVisibleParcels(parcels, viewport, pixelsPerParcel)) {
        return; // Skip places entirely outside viewport
      }

      const isEditing = place.id === editingPlaceId;
      const isBanned = placeBanIds.has(place.id);
      const color = place.groupColor || DEFAULT_PLACE_COLOR;

      const borderPath = calculateBorderPath(parcels, viewport, pixelsPerParcel);
      const fillPath = calculateFillPath(parcels, viewport, pixelsPerParcel);

      if (borderPath) {
        borders.push({
          id: `place-${place.id}`,
          path: borderPath,
          color,
          isEditing,
          isBanned,
        });
        borders.push({
          id: `place-fill-${place.id}`,
          path: fillPath,
          color,
          isEditing,
          isBanned,
        });
      }
    });

    // Add banned scene borders (legacy scene bans)
    sceneBans.forEach((ban) => {
      const parcels = ban.positions.map(parsePosition);
      if (!hasVisibleParcels(parcels, viewport, pixelsPerParcel)) {
        return;
      }

      const borderPath = calculateBorderPath(parcels, viewport, pixelsPerParcel);
      const fillPath = calculateFillPath(parcels, viewport, pixelsPerParcel);

      if (borderPath) {
        borders.push({
          id: `ban-${ban.id}`,
          path: borderPath,
          color: BANNED_COLOR,
          isEditing: false,
          isBanned: true,
        });
        borders.push({
          id: `ban-fill-${ban.id}`,
          path: fillPath,
          color: BANNED_COLOR,
          isEditing: false,
          isBanned: true,
        });
      }
    });

    return borders;
  }, [visible, places, editingPlaceId, viewport, pixelsPerParcel, placeBanIds, sceneBans]);

  if (!visible || placeBorders.length === 0) {
    return null;
  }

  const fills = placeBorders.filter(b => b.id.includes('-fill-'));
  const strokes = placeBorders.filter(b => !b.id.includes('-fill-'));

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: viewport.width,
        height: viewport.height,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {fills.map((border) => (
        <path
          key={border.id}
          d={border.path}
          fill={border.isBanned ? BANNED_COLOR : border.color}
          fillOpacity={PLACE_FILL_OPACITY}
          stroke="none"
        />
      ))}
      {strokes.map((border) => (
        <path
          key={border.id}
          d={border.path}
          fill="none"
          stroke={border.isBanned ? BANNED_COLOR : border.color}
          strokeWidth={border.isBanned ? BANNED_STROKE_WIDTH : (border.isEditing ? EDITING_STROKE_WIDTH : PLACE_STROKE_WIDTH)}
          strokeDasharray={border.isEditing ? '6 3' : undefined}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}
