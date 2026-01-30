// Map modes - extensible for future features
export type MapMode = 'view' | 'groups';

export interface TileCoord {
  x: number;
  y: number;
}

export interface ParcelCoord {
  x: number;
  y: number;
}

export interface ViewportState {
  centerX: number;
  centerY: number;
  zoom: number;
  width: number;
  height: number;
}

export interface InteractionState {
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  hoveredParcel: ParcelCoord | null;
}

export interface MapState {
  viewport: ViewportState;
  interaction: InteractionState;
}

export type MapAction =
  | { type: 'SET_VIEWPORT_SIZE'; payload: { width: number; height: number } }
  | { type: 'PAN'; payload: { deltaX: number; deltaY: number } }
  | { type: 'ZOOM'; payload: { factor: number; centerX?: number; centerY?: number } }
  | { type: 'SET_CENTER'; payload: ParcelCoord }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'START_DRAG'; payload: { x: number; y: number } }
  | { type: 'END_DRAG' }
  | { type: 'UPDATE_DRAG_START'; payload: { x: number; y: number } }
  | { type: 'SET_HOVERED_PARCEL'; payload: ParcelCoord | null }
  | { type: 'RESET_VIEW' };

export interface TileLoadState {
  status: 'loading' | 'loaded' | 'error';
  image?: HTMLImageElement;
}

// Tags type
export interface Tag {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

// Places Model Types
export type PlaceType = 'scene' | 'world';

export interface Place {
  id: string;
  type: PlaceType;
  name: string | null;          // Scene/world title
  basePosition: string | null;  // "x,y" format for scenes, null for worlds
  worldName: string | null;     // For worlds
  sceneId: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  tags: string[];
  positions: string[];          // ["x,y", "x,y"] format for scenes
  createdAt: number;
  updatedAt: number;
}

export interface PlaceGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  placeCount: number;
  tags: string[];           // Aggregated from places' tags
  createdAt: number;
  updatedAt: number;
}

// Flattened place with ban status (as returned by API)
export type PlaceWithBanStatus = Place & {
  isBanned: boolean;
  banSceneId: string | null;
}

// Places State
export interface PlacesState {
  mode: MapMode;
  places: Place[];
  placeGroups: PlaceGroup[];
  selectedParcels: ParcelCoord[];
  selectionColor: string | null;
  editingPlaceId: string | null;
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;
}

export type PlacesAction =
  | { type: 'SET_MODE'; payload: MapMode }
  | { type: 'ADD_PLACE'; payload: Place }
  | { type: 'UPDATE_PLACE'; payload: Place }
  | { type: 'DELETE_PLACE'; payload: string }
  | { type: 'ADD_PLACE_GROUP'; payload: PlaceGroup }
  | { type: 'UPDATE_PLACE_GROUP'; payload: PlaceGroup }
  | { type: 'DELETE_PLACE_GROUP'; payload: string }
  | { type: 'SET_SELECTED_PARCELS'; payload: ParcelCoord[] }
  | { type: 'TOGGLE_PARCEL_SELECTION'; payload: ParcelCoord }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_EDITING_PLACE'; payload: string | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_SELECTION_COLOR'; payload: string | null }
  | { type: 'LOAD_PLACES'; payload: Place[] }
  | { type: 'LOAD_PLACE_GROUPS'; payload: PlaceGroup[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };
