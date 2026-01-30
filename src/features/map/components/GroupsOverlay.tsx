import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { useGroupsState } from '../context/useGroupsHooks';
import { useBansApi, useBansState } from '../context/useBansHooks';
import { parcelToScreen } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { SceneGroup, ParcelCoord } from '../types';

const GROUP_FILL_OPACITY = 0.15;
const GROUP_STROKE_WIDTH = 2;
const EDITING_STROKE_WIDTH = 3;
const BANNED_COLOR = '#FF4444';
const BANNED_STROKE_WIDTH = 2.5;

interface GroupBorderData {
  id: string;
  path: string;
  color: string;
  isEditing: boolean;
  isBanned: boolean;
}

interface GroupsOverlayProps {
  visible?: boolean;
}

/**
 * Calculate the border path for a set of parcels.
 * Instead of rendering individual rects for each parcel, this creates a single
 * SVG path that traces the outline of the connected parcels.
 */
function calculateBorderPath(
  parcels: ParcelCoord[],
  viewport: { centerX: number; centerY: number; width: number; height: number; zoom: number },
  pixelsPerParcel: number
): string {
  if (parcels.length === 0) return '';

  // Create a set for quick lookup
  const parcelSet = new Set(parcels.map(p => `${p.x},${p.y}`));

  // Collect all border edges
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const parcel of parcels) {
    const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
    const top = screenY - pixelsPerParcel;
    const bottom = screenY;
    const left = screenX;
    const right = screenX + pixelsPerParcel;

    // Check each neighbor - if no neighbor, add that edge
    // Top edge (check y+1 because y increases upward in world coords)
    if (!parcelSet.has(`${parcel.x},${parcel.y + 1}`)) {
      edges.push({ x1: left, y1: top, x2: right, y2: top });
    }
    // Bottom edge
    if (!parcelSet.has(`${parcel.x},${parcel.y - 1}`)) {
      edges.push({ x1: left, y1: bottom, x2: right, y2: bottom });
    }
    // Left edge
    if (!parcelSet.has(`${parcel.x - 1},${parcel.y}`)) {
      edges.push({ x1: left, y1: top, x2: left, y2: bottom });
    }
    // Right edge
    if (!parcelSet.has(`${parcel.x + 1},${parcel.y}`)) {
      edges.push({ x1: right, y1: top, x2: right, y2: bottom });
    }
  }

  // Convert edges to SVG path
  if (edges.length === 0) return '';

  return edges.map(e => `M${e.x1},${e.y1}L${e.x2},${e.y2}`).join('');
}

/**
 * Calculate a filled polygon path for a set of parcels.
 * This creates rectangles for each parcel to allow fill.
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
  // Calculate viewport bounds in parcel coordinates
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

export function GroupsOverlay({ visible = true }: GroupsOverlayProps) {
  const { viewport } = useMapState();
  const { groups, editingGroupId } = useGroupsState();
  const { checkGroupBanned } = useBansApi();
  const { bans } = useBansState();

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  // Get scene bans (bans with parcels but no groupId or worldName)
  const sceneBans = useMemo(() => {
    return bans.filter(ban => ban.groupId === null && ban.worldName === null && ban.parcels.length > 0);
  }, [bans]);

  const groupBorders = useMemo(() => {
    if (!visible) return [];

    const borders: GroupBorderData[] = [];

    // Add scene group borders (only for groups with visible parcels)
    groups.forEach((group: SceneGroup) => {
      if (!hasVisibleParcels(group.parcels, viewport, pixelsPerParcel)) {
        return; // Skip groups entirely outside viewport
      }

      const isEditing = group.id === editingGroupId;
      const isBanned = checkGroupBanned(group.id);
      const borderPath = calculateBorderPath(group.parcels, viewport, pixelsPerParcel);
      const fillPath = calculateFillPath(group.parcels, viewport, pixelsPerParcel);

      if (borderPath) {
        borders.push({
          id: `group-${group.id}`,
          path: borderPath,
          color: group.color,
          isEditing,
          isBanned,
        });
        // Add fill as separate path for proper layering
        borders.push({
          id: `group-fill-${group.id}`,
          path: fillPath,
          color: group.color,
          isEditing,
          isBanned,
        });
      }
    });

    // Add banned scene borders
    sceneBans.forEach((ban) => {
      if (!hasVisibleParcels(ban.parcels, viewport, pixelsPerParcel)) {
        return;
      }

      const borderPath = calculateBorderPath(ban.parcels, viewport, pixelsPerParcel);
      const fillPath = calculateFillPath(ban.parcels, viewport, pixelsPerParcel);

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
  }, [visible, groups, editingGroupId, viewport, pixelsPerParcel, checkGroupBanned, sceneBans]);

  if (!visible || groupBorders.length === 0) {
    return null;
  }

  // Separate fills and strokes for proper rendering order
  const fills = groupBorders.filter(b => b.id.includes('-fill-'));
  const strokes = groupBorders.filter(b => !b.id.includes('-fill-'));

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
      {/* Render fills first */}
      {fills.map((border) => (
        <path
          key={border.id}
          d={border.path}
          fill={border.isBanned ? BANNED_COLOR : border.color}
          fillOpacity={GROUP_FILL_OPACITY}
          stroke="none"
        />
      ))}
      {/* Render strokes on top */}
      {strokes.map((border) => (
        <path
          key={border.id}
          d={border.path}
          fill="none"
          stroke={border.isBanned ? BANNED_COLOR : border.color}
          strokeWidth={border.isBanned ? BANNED_STROKE_WIDTH : (border.isEditing ? EDITING_STROKE_WIDTH : GROUP_STROKE_WIDTH)}
          strokeDasharray={border.isEditing ? '6 3' : undefined}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}
