import type { TileCoord } from '../types';
import { getTileUrl, getTileKey } from './coordinates';

interface CachedTile {
  image: HTMLImageElement;
  lastAccessed: number;
}

export class TileCache {
  private cache: Map<string, CachedTile> = new Map();
  private loading: Map<string, Promise<HTMLImageElement>> = new Map();
  private maxCacheSize: number;
  private onTileLoaded?: () => void;

  constructor(maxCacheSize = 100, onTileLoaded?: () => void) {
    this.maxCacheSize = maxCacheSize;
    this.onTileLoaded = onTileLoaded;
  }

  setOnTileLoaded(callback: () => void): void {
    this.onTileLoaded = callback;
  }

  /**
   * Get a tile from cache if available
   */
  getCached(tileX: number, tileY: number): HTMLImageElement | null {
    const key = getTileKey(tileX, tileY);
    const cached = this.cache.get(key);

    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.image;
    }

    return null;
  }

  /**
   * Check if a tile is currently loading
   */
  isLoading(tileX: number, tileY: number): boolean {
    const key = getTileKey(tileX, tileY);
    return this.loading.has(key);
  }

  /**
   * Load a tile asynchronously
   */
  async loadTile(tileX: number, tileY: number): Promise<HTMLImageElement> {
    const key = getTileKey(tileX, tileY);

    // Return cached tile
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.image;
    }

    // Return existing loading promise
    const existingPromise = this.loading.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // Start loading
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.cache.set(key, {
          image: img,
          lastAccessed: Date.now(),
        });
        this.loading.delete(key);
        this.evictIfNeeded();
        this.onTileLoaded?.();
        resolve(img);
      };

      img.onerror = (err) => {
        this.loading.delete(key);
        reject(err);
      };

      img.src = getTileUrl(tileX, tileY);
    });

    this.loading.set(key, promise);
    return promise;
  }

  /**
   * Preload tiles that are likely to be needed
   */
  preloadTiles(tiles: TileCoord[]): void {
    for (const tile of tiles) {
      const key = getTileKey(tile.x, tile.y);
      if (!this.cache.has(key) && !this.loading.has(key)) {
        this.loadTile(tile.x, tile.y).catch(() => {
          // Silently ignore preload failures
        });
      }
    }
  }

  /**
   * Evict least recently used tiles if cache is too large
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxCacheSize) {
      return;
    }

    // Sort by last accessed time
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    // Remove oldest entries until we're under the limit
    const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { cached: number; loading: number } {
    return {
      cached: this.cache.size,
      loading: this.loading.size,
    };
  }
}

// Singleton instance for the application
let globalTileCache: TileCache | null = null;

export function getTileCache(onTileLoaded?: () => void): TileCache {
  if (!globalTileCache) {
    globalTileCache = new TileCache(100, onTileLoaded);
  } else if (onTileLoaded) {
    globalTileCache.setOnTileLoaded(onTileLoaded);
  }
  return globalTileCache;
}
