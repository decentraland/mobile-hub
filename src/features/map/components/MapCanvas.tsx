import { useRef, useEffect, useCallback } from 'react';
import { useMapState } from '../context/useMapHooks';
import { useViewport } from '../hooks/useViewport';
import { useTileLoader } from '../hooks/useTileLoader';
import { useMapInteraction } from '../hooks/useMapInteraction';
import { getTileScreenRect, parcelToScreen } from '../utils/coordinates';
import {
  TILE_PLACEHOLDER_COLOR,
  BACKGROUND_COLOR,
  TILE_COUNT,
  BASE_PIXELS_PER_PARCEL,
} from '../utils/constants';
import type { ParcelCoord } from '../types';

interface MapCanvasProps {
  onParcelClick?: (parcel: ParcelCoord) => void;
}

export function MapCanvas({ onParcelClick }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { viewport, interaction } = useMapState();
  const { getTile, renderTrigger } = useTileLoader();

  useViewport(containerRef);
  const { isDragging } = useMapInteraction({ canvasRef, onParcelClick });

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = viewport;

    // Set canvas size for high DPI
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    }

    // Clear canvas with background color
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Draw tiles
    // genesis-city tiles: y=0 is TOP of map, y=7 is BOTTOM
    // Our world coordinates: higher Y is up (top of map)
    // So we need to flip Y when fetching: world row 0 (bottom) -> genesis row 7
    for (let tileX = 0; tileX < TILE_COUNT; tileX++) {
      for (let tileY = 0; tileY < TILE_COUNT; tileY++) {
        const rect = getTileScreenRect(tileX, tileY, viewport);

        // Skip tiles that are completely off-screen
        if (
          rect.x + rect.width < 0 ||
          rect.x > width ||
          rect.y + rect.height < 0 ||
          rect.y > height
        ) {
          continue;
        }

        // Flip Y for genesis-city tile fetch
        const genesisTileY = TILE_COUNT - 1 - tileY;
        const image = getTile(tileX, genesisTileY);

        if (image) {
          ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        } else {
          // Draw placeholder while loading
          ctx.fillStyle = TILE_PLACEHOLDER_COLOR;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
      }
    }

    // Draw hover marker
    if (interaction.hoveredParcel) {
      const { hoveredParcel } = interaction;
      const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;
      const { screenX, screenY } = parcelToScreen(
        hoveredParcel.x,
        hoveredParcel.y,
        viewport
      );

      // Calculate parcel bounds on screen
      const parcelLeft = screenX;
      const parcelTop = screenY - pixelsPerParcel;
      const parcelSize = pixelsPerParcel;

      // Draw corner brackets (like Unity)
      const cornerLength = Math.max(4, parcelSize * 0.25);
      const lineWidth = Math.max(1, parcelSize * 0.08);

      ctx.strokeStyle = 'white';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'square';

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(parcelLeft, parcelTop + cornerLength);
      ctx.lineTo(parcelLeft, parcelTop);
      ctx.lineTo(parcelLeft + cornerLength, parcelTop);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(parcelLeft + parcelSize - cornerLength, parcelTop);
      ctx.lineTo(parcelLeft + parcelSize, parcelTop);
      ctx.lineTo(parcelLeft + parcelSize, parcelTop + cornerLength);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(parcelLeft, parcelTop + parcelSize - cornerLength);
      ctx.lineTo(parcelLeft, parcelTop + parcelSize);
      ctx.lineTo(parcelLeft + cornerLength, parcelTop + parcelSize);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(parcelLeft + parcelSize - cornerLength, parcelTop + parcelSize);
      ctx.lineTo(parcelLeft + parcelSize, parcelTop + parcelSize);
      ctx.lineTo(parcelLeft + parcelSize, parcelTop + parcelSize - cornerLength);
      ctx.stroke();
    }
  }, [viewport, getTile, interaction]);

  // Render loop
  useEffect(() => {
    const animate = () => {
      render();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render, renderTrigger]);

  // Determine cursor style
  const cursorStyle = isDragging ? 'grabbing' : 'grab';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          cursor: cursorStyle,
          touchAction: 'none',
        }}
      />
    </div>
  );
}
