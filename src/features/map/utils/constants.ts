// Tile system configuration
export const PARCELS_PER_TILE = 40;
export const TILE_COUNT = 8;
export const TOTAL_PARCELS = TILE_COUNT * PARCELS_PER_TILE; // 320

// Tile offset - satellite images have border parcels outside the world
// Based on Unity: top-left tile center is at (-133, 132)
// Tile grid spans 320 parcels, adjusted to match Unity exactly:
export const TILE_ORIGIN_X = -152;
export const TILE_ORIGIN_Y = -167;

// Tile-based bounds (actual image coverage)
export const TILE_MIN_X = TILE_ORIGIN_X;
export const TILE_MAX_X = TILE_ORIGIN_X + TOTAL_PARCELS;
export const TILE_MIN_Y = TILE_ORIGIN_Y;
export const TILE_MAX_Y = TILE_ORIGIN_Y + TOTAL_PARCELS;

// Genesis City world bounds (for reference)
export const WORLD_MIN_X = -150;
export const WORLD_MAX_X = 163;
export const WORLD_MIN_Y = -150;
export const WORLD_MAX_Y = 158;

// Zoom configuration
export const BASE_PIXELS_PER_PARCEL = 4;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10;
export const DEFAULT_ZOOM = 1;

// Initial viewport center (center of Genesis City)
export const DEFAULT_CENTER_X = 0;
export const DEFAULT_CENTER_Y = 0;

// Tile URL configuration
export const TILE_BASE_URL =
  'https://media.githubusercontent.com/media/genesis-city/parcels/new-client-images/maps/lod-0/3/';

// Rendering - matches tile image edge color
export const TILE_PLACEHOLDER_COLOR = '#1a1a1a';
export const BACKGROUND_COLOR = '#1a1a1a';
