import { useContext, type Dispatch } from 'react';
import type { MapState, MapAction } from '../types';
import { MapContext, type MapContextValue } from './mapContextDef';

export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}

export function useMapState(): MapState {
  return useMapContext().state;
}

export function useMapDispatch(): Dispatch<MapAction> {
  return useMapContext().dispatch;
}
