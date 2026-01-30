import type { TileCoord, ParcelCoord, ViewportState } from '../types';
import {
  PARCELS_PER_TILE,
  TILE_COUNT,
  TILE_ORIGIN_X,
  TILE_ORIGIN_Y,
  BASE_PIXELS_PER_PARCEL,
  TILE_BASE_URL,
} from './constants';

/**
 * Parse a "x,y" position string into {x, y} object
 */
export function parsePosition(position: string): ParcelCoord {
  const [x, y] = position.split(',').map(Number);
  return { x, y };
}

/**
 * Format {x, y} coordinates to "x,y" string
 */
export function formatPosition(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Format a ParcelCoord to "x,y" string
 */
export function formatParcelCoord(parcel: ParcelCoord): string {
  return `${parcel.x},${parcel.y}`;
}

/**
 * Check if a position string is valid
 */
export function isValidPosition(position: string): boolean {
  const parts = position.split(',');
  if (parts.length !== 2) return false;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return !isNaN(x) && !isNaN(y);
}

/**
 * Convert an array of position strings to ParcelCoord objects
 */
export function positionsToCoords(positions: string[]): ParcelCoord[] {
  return positions.map(parsePosition);
}

/**
 * Convert an array of ParcelCoord objects to position strings
 */
export function coordsToPositions(coords: ParcelCoord[]): string[] {
  return coords.map(formatParcelCoord);
}

/**
 * Convert parcel coordinates to tile index
 */
export function parcelToTileIndex(parcelX: number, parcelY: number): TileCoord {
  // Normalize parcel coordinates to 0-based system using tile origin
  const normalizedX = parcelX - TILE_ORIGIN_X;
  const normalizedY = parcelY - TILE_ORIGIN_Y;

  const tileX = Math.floor(normalizedX / PARCELS_PER_TILE);
  const tileY = Math.floor(normalizedY / PARCELS_PER_TILE);

  return {
    x: Math.max(0, Math.min(TILE_COUNT - 1, tileX)),
    y: Math.max(0, Math.min(TILE_COUNT - 1, tileY)),
  };
}

/**
 * Get the parcel range covered by a tile
 */
export function tileToParcelRange(tileX: number, tileY: number): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  return {
    minX: TILE_ORIGIN_X + tileX * PARCELS_PER_TILE,
    maxX: TILE_ORIGIN_X + (tileX + 1) * PARCELS_PER_TILE - 1,
    minY: TILE_ORIGIN_Y + tileY * PARCELS_PER_TILE,
    maxY: TILE_ORIGIN_Y + (tileY + 1) * PARCELS_PER_TILE - 1,
  };
}

/**
 * Convert screen position to parcel coordinates
 */
export function screenToParcel(
  screenX: number,
  screenY: number,
  viewport: ViewportState
): ParcelCoord {
  const { centerX, centerY, zoom, width, height } = viewport;
  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * zoom;

  // Offset from center of viewport in pixels
  const offsetX = screenX - width / 2;
  const offsetY = screenY - height / 2;

  // Convert pixel offset to parcel offset
  // Y axis is inverted (screen Y increases downward, parcel Y increases upward)
  const parcelOffsetX = offsetX / pixelsPerParcel;
  const parcelOffsetY = -offsetY / pixelsPerParcel;

  return {
    x: Math.floor(centerX + parcelOffsetX),
    y: Math.floor(centerY + parcelOffsetY),
  };
}

/**
 * Convert parcel coordinates to screen position
 */
export function parcelToScreen(
  parcelX: number,
  parcelY: number,
  viewport: ViewportState
): { screenX: number; screenY: number } {
  const { centerX, centerY, zoom, width, height } = viewport;
  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * zoom;

  const screenX = width / 2 + (parcelX - centerX) * pixelsPerParcel;
  const screenY = height / 2 - (parcelY - centerY) * pixelsPerParcel;

  return { screenX, screenY };
}

/**
 * Get all tiles visible in the current viewport
 */
export function getVisibleTiles(viewport: ViewportState): TileCoord[] {
  const { centerX, centerY, zoom, width, height } = viewport;
  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * zoom;

  // Calculate parcel bounds of visible area with some padding
  const halfWidthInParcels = width / 2 / pixelsPerParcel + PARCELS_PER_TILE;
  const halfHeightInParcels = height / 2 / pixelsPerParcel + PARCELS_PER_TILE;

  const minParcelX = centerX - halfWidthInParcels;
  const maxParcelX = centerX + halfWidthInParcels;
  const minParcelY = centerY - halfHeightInParcels;
  const maxParcelY = centerY + halfHeightInParcels;

  // Convert to tile indices
  const minTile = parcelToTileIndex(minParcelX, minParcelY);
  const maxTile = parcelToTileIndex(maxParcelX, maxParcelY);

  // Generate list of visible tiles
  const tiles: TileCoord[] = [];
  for (let tx = minTile.x; tx <= maxTile.x; tx++) {
    for (let ty = minTile.y; ty <= maxTile.y; ty++) {
      if (tx >= 0 && tx < TILE_COUNT && ty >= 0 && ty < TILE_COUNT) {
        tiles.push({ x: tx, y: ty });
      }
    }
  }

  return tiles;
}

/**
 * Generate tile URL for a given tile coordinate
 */
export function getTileUrl(tileX: number, tileY: number): string {
  // URL uses encoded comma: %2C
  return `${TILE_BASE_URL}${tileX}%2C${tileY}.jpg`;
}

/**
 * Get the screen rectangle for a tile
 */
export function getTileScreenRect(
  tileX: number,
  tileY: number,
  viewport: ViewportState
): { x: number; y: number; width: number; height: number } {
  const pixelsPerParcel = BASE_PIXELS_PER_PARCEL * viewport.zoom;
  const tilePixelSize = PARCELS_PER_TILE * pixelsPerParcel;

  // Get the parcel origin of the tile (bottom-left corner in parcel coords)
  // Using TILE_ORIGIN which accounts for the border offset
  const tileParcelOriginX = TILE_ORIGIN_X + tileX * PARCELS_PER_TILE;
  const tileParcelOriginY = TILE_ORIGIN_Y + tileY * PARCELS_PER_TILE;

  // Convert to screen position
  // Note: screen Y needs to account for tile height since screen Y is top-down
  const screenX =
    viewport.width / 2 + (tileParcelOriginX - viewport.centerX) * pixelsPerParcel;
  const screenY =
    viewport.height / 2 -
    (tileParcelOriginY + PARCELS_PER_TILE - viewport.centerY) * pixelsPerParcel;

  return {
    x: screenX,
    y: screenY,
    width: tilePixelSize,
    height: tilePixelSize,
  };
}

/**
 * Create a unique key for a tile
 */
export function getTileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}
