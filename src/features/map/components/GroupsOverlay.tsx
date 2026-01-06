import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { useGroupsState } from '../context/useGroupsHooks';
import { useBansApi, useBansState } from '../context/useBansHooks';
import { parcelToScreen } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { SceneGroup } from '../types';

const GROUP_FILL_OPACITY = 0.2;
const GROUP_STROKE_WIDTH = 1.5;
const EDITING_STROKE_WIDTH = 2;
const BANNED_COLOR = '#FF4444';
const BANNED_STROKE_WIDTH = 2.5;

interface GroupRectData {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isEditing: boolean;
  isBanned: boolean;
}

export function GroupsOverlay() {
  const { viewport } = useMapState();
  const { groups, editingGroupId } = useGroupsState();
  const { checkGroupBanned } = useBansApi();
  const { bans } = useBansState();

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  // Get scene bans (bans with parcels but no groupId or worldName)
  const sceneBans = useMemo(() => {
    return bans.filter(ban => ban.groupId === null && ban.worldName === null && ban.parcels.length > 0);
  }, [bans]);

  const allRects = useMemo(() => {
    const rects: GroupRectData[] = [];

    // Add scene group parcels
    groups.forEach((group: SceneGroup) => {
      const isEditing = group.id === editingGroupId;
      const isBanned = checkGroupBanned(group.id);

      group.parcels.forEach((parcel) => {
        const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
        rects.push({
          key: `group-${group.id}-${parcel.x},${parcel.y}`,
          x: screenX,
          y: screenY - pixelsPerParcel,
          width: pixelsPerParcel,
          height: pixelsPerParcel,
          color: group.color,
          isEditing,
          isBanned,
        });
      });
    });

    // Add banned scene parcels (not in groups)
    sceneBans.forEach((ban) => {
      ban.parcels.forEach((parcel) => {
        const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
        rects.push({
          key: `ban-${ban.id}-${parcel.x},${parcel.y}`,
          x: screenX,
          y: screenY - pixelsPerParcel,
          width: pixelsPerParcel,
          height: pixelsPerParcel,
          color: BANNED_COLOR,
          isEditing: false,
          isBanned: true,
        });
      });
    });

    return rects;
  }, [groups, editingGroupId, viewport, pixelsPerParcel, checkGroupBanned, sceneBans]);

  if (allRects.length === 0) {
    return null;
  }

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
      {allRects.map((rect) => (
        <rect
          key={rect.key}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={rect.isBanned ? BANNED_COLOR : rect.color}
          fillOpacity={GROUP_FILL_OPACITY}
          stroke={rect.isBanned ? BANNED_COLOR : rect.color}
          strokeWidth={rect.isBanned ? BANNED_STROKE_WIDTH : (rect.isEditing ? EDITING_STROKE_WIDTH : GROUP_STROKE_WIDTH)}
          strokeDasharray={rect.isEditing ? '6 3' : undefined}
        />
      ))}
    </svg>
  );
}
