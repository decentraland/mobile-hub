import { useMemo } from 'react';
import { useMapState } from '../context/useMapHooks';
import { parcelToScreen } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { ParcelCoord } from '../types';

const HIGHLIGHT_COLOR = '#00D9FF';
const HIGHLIGHT_FILL_OPACITY = 0.25;
const HIGHLIGHT_STROKE_WIDTH = 2;

interface SceneHighlightOverlayProps {
  parcels: ParcelCoord[];
}

export function SceneHighlightOverlay({ parcels }: SceneHighlightOverlayProps) {
  const { viewport } = useMapState();

  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;

  const parcelRects = useMemo(() => {
    return parcels.map((parcel) => {
      const { screenX, screenY } = parcelToScreen(parcel.x, parcel.y, viewport);
      return {
        key: `${parcel.x},${parcel.y}`,
        x: screenX,
        y: screenY - pixelsPerParcel,
        width: pixelsPerParcel,
        height: pixelsPerParcel,
      };
    });
  }, [parcels, viewport, pixelsPerParcel]);

  if (parcels.length === 0) {
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
          fill={HIGHLIGHT_COLOR}
          fillOpacity={HIGHLIGHT_FILL_OPACITY}
          stroke={HIGHLIGHT_COLOR}
          strokeWidth={HIGHLIGHT_STROKE_WIDTH}
        />
      ))}
    </svg>
  );
}
