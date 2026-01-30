import { createContext, type Dispatch } from 'react';
import type { PlacesState, PlacesAction, Place, PlaceGroup, PlaceType } from '../types';

export interface CreatePlaceInput {
  type: PlaceType;
  basePosition?: string;  // "x,y" format
  worldName?: string;
  sceneId?: string;
  groupId?: string;
  tags?: string[];
  positions?: string[];  // ["x,y", "x,y"] format
}

export interface UpdatePlaceInput {
  basePosition?: string;  // "x,y" format
  worldName?: string;
  sceneId?: string | null;
  groupId?: string | null;
  tags?: string[];
  positions?: string[];  // ["x,y", "x,y"] format
}

export interface CreatePlaceGroupInput {
  name: string;
  description?: string;
  color: string;
}

export interface UpdatePlaceGroupInput {
  name?: string;
  description?: string;
  color?: string;
}

export interface PlacesContextValue {
  state: PlacesState;
  dispatch: Dispatch<PlacesAction>;
  // Place operations
  createPlace: (input: CreatePlaceInput) => Promise<Place | null>;
  updatePlace: (id: string, input: UpdatePlaceInput) => Promise<Place | null>;
  deletePlace: (id: string) => Promise<boolean>;
  setPlaceGroup: (placeId: string, groupId: string) => Promise<Place | null>;
  removePlaceGroup: (placeId: string) => Promise<Place | null>;
  // Place Group operations
  createPlaceGroup: (input: CreatePlaceGroupInput) => Promise<PlaceGroup | null>;
  updatePlaceGroup: (id: string, input: UpdatePlaceGroupInput) => Promise<PlaceGroup | null>;
  deletePlaceGroup: (id: string) => Promise<boolean>;
  // Reload data
  reloadPlaces: () => Promise<void>;
  reloadPlaceGroups: () => Promise<void>;
}

export const PlacesContext = createContext<PlacesContextValue | null>(null);
