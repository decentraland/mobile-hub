import { useReducer, type ReactNode } from 'react';
import type { MapState, MapAction, ParcelCoord } from '../types';
import { MapContext } from './mapContextDef';
import {
  DEFAULT_CENTER_X,
  DEFAULT_CENTER_Y,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  WORLD_MIN_X,
  WORLD_MAX_X,
  WORLD_MIN_Y,
  WORLD_MAX_Y,
} from '../utils/constants';

const initialState: MapState = {
  viewport: {
    centerX: DEFAULT_CENTER_X,
    centerY: DEFAULT_CENTER_Y,
    zoom: DEFAULT_ZOOM,
    width: 0,
    height: 0,
  },
  interaction: {
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    hoveredParcel: null,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case 'SET_VIEWPORT_SIZE':
      return {
        ...state,
        viewport: {
          ...state.viewport,
          width: action.payload.width,
          height: action.payload.height,
        },
      };

    case 'PAN': {
      const newCenterX = clamp(
        state.viewport.centerX + action.payload.deltaX,
        WORLD_MIN_X,
        WORLD_MAX_X
      );
      const newCenterY = clamp(
        state.viewport.centerY + action.payload.deltaY,
        WORLD_MIN_Y,
        WORLD_MAX_Y
      );
      return {
        ...state,
        viewport: {
          ...state.viewport,
          centerX: newCenterX,
          centerY: newCenterY,
        },
      };
    }

    case 'ZOOM': {
      const newZoom = clamp(
        state.viewport.zoom * action.payload.factor,
        MIN_ZOOM,
        MAX_ZOOM
      );
      return {
        ...state,
        viewport: {
          ...state.viewport,
          zoom: newZoom,
        },
      };
    }

    case 'SET_CENTER':
      return {
        ...state,
        viewport: {
          ...state.viewport,
          centerX: clamp(action.payload.x, WORLD_MIN_X, WORLD_MAX_X),
          centerY: clamp(action.payload.y, WORLD_MIN_Y, WORLD_MAX_Y),
        },
      };

    case 'SET_ZOOM':
      return {
        ...state,
        viewport: {
          ...state.viewport,
          zoom: clamp(action.payload, MIN_ZOOM, MAX_ZOOM),
        },
      };

    case 'START_DRAG':
      return {
        ...state,
        interaction: {
          ...state.interaction,
          isDragging: true,
          dragStartX: action.payload.x,
          dragStartY: action.payload.y,
        },
      };

    case 'END_DRAG':
      return {
        ...state,
        interaction: {
          ...state.interaction,
          isDragging: false,
        },
      };

    case 'UPDATE_DRAG_START':
      return {
        ...state,
        interaction: {
          ...state.interaction,
          dragStartX: action.payload.x,
          dragStartY: action.payload.y,
        },
      };

    case 'SET_HOVERED_PARCEL':
      return {
        ...state,
        interaction: {
          ...state.interaction,
          hoveredParcel: action.payload,
        },
      };

    case 'RESET_VIEW':
      return {
        ...state,
        viewport: {
          ...state.viewport,
          centerX: DEFAULT_CENTER_X,
          centerY: DEFAULT_CENTER_Y,
          zoom: DEFAULT_ZOOM,
        },
      };

    default:
      return state;
  }
}

interface MapProviderProps {
  children: ReactNode;
  initialCenter?: ParcelCoord;
  initialZoom?: number;
}

export function MapProvider({
  children,
  initialCenter,
  initialZoom,
}: MapProviderProps) {
  const customInitialState: MapState = {
    ...initialState,
    viewport: {
      ...initialState.viewport,
      centerX: initialCenter?.x ?? DEFAULT_CENTER_X,
      centerY: initialCenter?.y ?? DEFAULT_CENTER_Y,
      zoom: initialZoom ?? DEFAULT_ZOOM,
    },
  };

  const [state, dispatch] = useReducer(mapReducer, customInitialState);

  return (
    <MapContext.Provider value={{ state, dispatch }}>
      {children}
    </MapContext.Provider>
  );
}
