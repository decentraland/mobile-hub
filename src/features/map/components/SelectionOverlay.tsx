import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { useGroupsState } from '../context/useGroupsHooks';
import { parcelToScreen } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';

const DEFAULT_SELECTION_COLOR = '#00D9FF';
const SELECTION_FILL_OPACITY = 0.3;
const SELECTION_STROKE_WIDTH = 2;

export function SelectionOverlay() {
  const { viewport } = useMapState();
  const { selectedParcels, selectionColor } = useGroupsState();

  const color = selectionColor || DEFAULT_SELECTION_COLOR;

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  const parcelRects = useMemo(() => {
    return selectedParcels.map((parcel) => {
      const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
      return {
        key: `${parcel.x},${parcel.y}`,
        x: screenX,
        y: screenY - pixelsPerParcel,
        width: pixelsPerParcel,
        height: pixelsPerParcel,
      };
    });
  }, [selectedParcels, viewport, pixelsPerParcel]);

  if (selectedParcels.length === 0) {
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
      {parcelRects.map((rect) => (
        <rect
          key={rect.key}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={color}
          fillOpacity={SELECTION_FILL_OPACITY}
          stroke={color}
          strokeWidth={SELECTION_STROKE_WIDTH}
          strokeDasharray="4 2"
        />
      ))}
    </svg>
  );
}
