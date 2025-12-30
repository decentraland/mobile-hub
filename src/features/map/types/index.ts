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

// Scene Groups Types
export interface SceneGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  tags: string[];
  parcels: ParcelCoord[];
  createdAt: number;
  updatedAt: number;
}

export interface GroupsState {
  mode: MapMode;
  groups: SceneGroup[];
  selectedParcels: ParcelCoord[];
  selectionColor: string | null;
  editingGroupId: string | null;
  sidebarOpen: boolean;
}

export type GroupsAction =
  | { type: 'SET_MODE'; payload: MapMode }
  | { type: 'ADD_GROUP'; payload: SceneGroup }
  | { type: 'UPDATE_GROUP'; payload: SceneGroup }
  | { type: 'DELETE_GROUP'; payload: string }
  | { type: 'SET_SELECTED_PARCELS'; payload: ParcelCoord[] }
  | { type: 'TOGGLE_PARCEL_SELECTION'; payload: ParcelCoord }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_EDITING_GROUP'; payload: string | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_SELECTION_COLOR'; payload: string | null }
  | { type: 'LOAD_GROUPS'; payload: SceneGroup[] };
