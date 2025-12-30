import { createContext, type Dispatch } from 'react';
import type { MapState, MapAction } from '../types';

export interface MapContextValue {
  state: MapState;
  dispatch: Dispatch<MapAction>;
}

export const MapContext = createContext<MapContextValue | null>(null);
