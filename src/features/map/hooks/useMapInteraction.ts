import { useEffect, useCallback, useRef } from 'react';
import { useMapState, useMapDispatch } from '../context/useMapHooks';
import { screenToParcel } from '../utils/coordinates';
import { BASE_PIXELS_PER_PARCEL } from '../utils/constants';
import type { ParcelCoord } from '../types';

interface UseMapInteractionOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onParcelClick?: (parcel: ParcelCoord) => void;
}

export function useMapInteraction({
  canvasRef,
  onParcelClick,
}: UseMapInteractionOptions) {
  const { viewport, interaction } = useMapState();
  const dispatch = useMapDispatch();
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDistanceRef = useRef<number | null>(null);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      clickStartRef.current = { x: e.clientX, y: e.clientY };
      dispatch({ type: 'START_DRAG', payload: { x: e.clientX, y: e.clientY } });
    },
    [dispatch]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Update hovered parcel
      const parcel = screenToParcel(localX, localY, viewport);
      dispatch({ type: 'SET_HOVERED_PARCEL', payload: parcel });

      // Handle drag
      if (interaction.isDragging) {
        const deltaX = e.clientX - interaction.dragStartX;
        const deltaY = e.clientY - interaction.dragStartY;

        const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;
        const parcelDeltaX = -deltaX / pixelsPerParcel;
        const parcelDeltaY = deltaY / pixelsPerParcel;

        dispatch({ type: 'PAN', payload: { deltaX: parcelDeltaX, deltaY: parcelDeltaY } });
        dispatch({
          type: 'UPDATE_DRAG_START',
          payload: { x: e.clientX, y: e.clientY },
        });
      }
    },
    [canvasRef, viewport, interaction, dispatch]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      // Detect click (minimal movement)
      if (clickStartRef.current) {
        const dx = Math.abs(e.clientX - clickStartRef.current.x);
        const dy = Math.abs(e.clientY - clickStartRef.current.y);

        if (dx < 5 && dy < 5 && onParcelClick) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const parcel = screenToParcel(localX, localY, viewport);
            onParcelClick(parcel);
          }
        }
      }

      clickStartRef.current = null;
      dispatch({ type: 'END_DRAG' });
    },
    [canvasRef, viewport, onParcelClick, dispatch]
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    dispatch({ type: 'SET_HOVERED_PARCEL', payload: null });
    dispatch({ type: 'END_DRAG' });
    clickStartRef.current = null;
  }, [dispatch]);

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Get parcel under mouse before zoom
      const parcelUnderMouse = screenToParcel(localX, localY, viewport);

      // Calculate zoom factor (small steps for smooth zoom)
      const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;
      const newZoom = Math.max(0.5, Math.min(10, viewport.zoom * zoomFactor));
      const newPixelsPerParcel = BASE_PIXELS_PER_PARCEL * newZoom;

      // Calculate new center to keep the parcel under the mouse in the same screen position
      // Formula: centerX = parcelX - (screenX - width/2) / pixelsPerParcel
      const newCenterX = parcelUnderMouse.x - (localX - viewport.width / 2) / newPixelsPerParcel;
      const newCenterY = parcelUnderMouse.y + (localY - viewport.height / 2) / newPixelsPerParcel;

      // Apply zoom
      dispatch({ type: 'SET_ZOOM', payload: newZoom });

      // Apply new center
      dispatch({ type: 'SET_CENTER', payload: { x: newCenterX, y: newCenterY } });
    },
    [canvasRef, viewport, dispatch]
  );

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        clickStartRef.current = { x: touch.clientX, y: touch.clientY };
        dispatch({
          type: 'START_DRAG',
          payload: { x: touch.clientX, y: touch.clientY },
        });
      } else if (e.touches.length === 2) {
        // Start pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    },
    [dispatch]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1 && interaction.isDragging) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - interaction.dragStartX;
        const deltaY = touch.clientY - interaction.dragStartY;

        const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;
        const parcelDeltaX = -deltaX / pixelsPerParcel;
        const parcelDeltaY = deltaY / pixelsPerParcel;

        dispatch({
          type: 'PAN',
          payload: { deltaX: parcelDeltaX, deltaY: parcelDeltaY },
        });
        dispatch({
          type: 'UPDATE_DRAG_START',
          payload: { x: touch.clientX, y: touch.clientY },
        });
      } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
        // Handle pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDistance = Math.sqrt(dx * dx + dy * dy);

        const zoomFactor = newDistance / touchDistanceRef.current;
        dispatch({ type: 'ZOOM', payload: { factor: zoomFactor } });
        touchDistanceRef.current = newDistance;
      }
    },
    [interaction, viewport.zoom, dispatch]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 0) {
        // Check for tap
        if (clickStartRef.current && onParcelClick) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const localX = clickStartRef.current.x - rect.left;
            const localY = clickStartRef.current.y - rect.top;
            const parcel = screenToParcel(localX, localY, viewport);
            onParcelClick(parcel);
          }
        }

        clickStartRef.current = null;
        touchDistanceRef.current = null;
        dispatch({ type: 'END_DRAG' });
      } else if (e.touches.length === 1) {
        // Transitioned from pinch to single touch
        touchDistanceRef.current = null;
        const touch = e.touches[0];
        dispatch({
          type: 'UPDATE_DRAG_START',
          payload: { x: touch.clientX, y: touch.clientY },
        });
      }
    },
    [canvasRef, viewport, onParcelClick, dispatch]
  );

  // Attach event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [
    canvasRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  ]);

  return {
    isDragging: interaction.isDragging,
    hoveredParcel: interaction.hoveredParcel,
  };
}
