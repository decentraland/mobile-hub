import { useEffect, useRef, useCallback, useState } from 'react';
import { useMapState } from '../context/useMapHooks';
import { getTileCache } from '../utils/tileCache';
import { getVisibleTiles } from '../utils/coordinates';
import { TILE_COUNT } from '../utils/constants';
import type { TileCoord } from '../types';

export function useTileLoader() {
  const { viewport } = useMapState();
  const [renderTrigger, setRenderTrigger] = useState(0);
  const tileCacheRef = useRef(getTileCache());

  // Set up the callback to trigger re-renders when tiles load
  useEffect(() => {
    tileCacheRef.current.setOnTileLoaded(() => {
      setRenderTrigger((prev) => prev + 1);
    });
  }, []);

  // Get visible tiles (in world coordinates) and start loading them
  const visibleTiles = getVisibleTiles(viewport);

  useEffect(() => {
    // Load all visible tiles
    // Note: genesis-city tiles have Y=0 at top, but our world has Y increasing upward
    // So we flip Y when loading: world row 0 (bottom) -> genesis row 7
    for (const tile of visibleTiles) {
      const genesisTileY = TILE_COUNT - 1 - tile.y;
      if (!tileCacheRef.current.getCached(tile.x, genesisTileY)) {
        tileCacheRef.current.loadTile(tile.x, genesisTileY).catch(() => {
          // Ignore individual tile load failures
        });
      }
    }
  }, [visibleTiles]);

  const getTile = useCallback(
    (tileX: number, tileY: number): HTMLImageElement | null => {
      return tileCacheRef.current.getCached(tileX, tileY);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderTrigger]
  );

  const preloadAdjacentTiles = useCallback((tiles: TileCoord[]) => {
    tileCacheRef.current.preloadTiles(tiles);
  }, []);

  return {
    visibleTiles,
    getTile,
    preloadAdjacentTiles,
    renderTrigger,
  };
}
