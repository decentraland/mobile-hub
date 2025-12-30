import { useEffect, useRef, useCallback } from 'react';
import { useMapDispatch } from '../context/useMapHooks';

export function useViewport(containerRef: React.RefObject<HTMLElement | null>) {
  const dispatch = useMapDispatch();
  const observerRef = useRef<ResizeObserver | null>(null);

  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      dispatch({ type: 'SET_VIEWPORT_SIZE', payload: { width, height } });
    }
  }, [containerRef, dispatch]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial size update
    updateSize();

    // Create ResizeObserver
    observerRef.current = new ResizeObserver(() => {
      updateSize();
    });

    observerRef.current.observe(container);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef, updateSize]);

  return { updateSize };
}
