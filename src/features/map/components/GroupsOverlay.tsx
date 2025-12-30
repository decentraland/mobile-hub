import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { useGroupsState } from '../context/useGroupsHooks';
import { parcelToScreen } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { SceneGroup } from '../types';

const GROUP_FILL_OPACITY = 0.2;
const GROUP_STROKE_WIDTH = 1.5;
const EDITING_STROKE_WIDTH = 2;

interface GroupRectData {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isEditing: boolean;
}

export function GroupsOverlay() {
  const { viewport } = useMapState();
  const { groups, editingGroupId } = useGroupsState();

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  const groupRects = useMemo(() => {
    const rects: GroupRectData[] = [];

    groups.forEach((group: SceneGroup) => {
      const isEditing = group.id === editingGroupId;

      group.parcels.forEach((parcel) => {
        const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
        rects.push({
          key: `${group.id}-${parcel.x},${parcel.y}`,
          x: screenX,
          y: screenY - pixelsPerParcel,
          width: pixelsPerParcel,
          height: pixelsPerParcel,
          color: group.color,
          isEditing,
        });
      });
    });

    return rects;
  }, [groups, editingGroupId, viewport, pixelsPerParcel]);

  if (groups.length === 0) {
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
      {groupRects.map((rect) => (
        <rect
          key={rect.key}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={rect.color}
          fillOpacity={GROUP_FILL_OPACITY}
          stroke={rect.color}
          strokeWidth={rect.isEditing ? EDITING_STROKE_WIDTH : GROUP_STROKE_WIDTH}
          strokeDasharray={rect.isEditing ? '6 3' : undefined}
        />
      ))}
    </svg>
  );
}
