import { useReducer, useEffect, useCallback, type ReactNode } from 'react';
import { PlacesContext } from './placesContextDef';
import { useAuthenticatedFetch } from '../../../hooks/useAuthenticatedFetch';
import { useAuth } from '../../../contexts/auth';
import { isDevMode } from '../../../utils/devIdentity';
import * as api from '../api/placesApi';
import type { PlacesState, PlacesAction, ParcelCoord, Place, PlaceGroup } from '../types';

const initialState: PlacesState = {
  mode: 'view',
  places: [],
  placeGroups: [],
  selectedParcels: [],
  selectionColor: null,
  editingPlaceId: null,
  sidebarOpen: false,
  isLoading: false,
  error: null,
};

function parcelEquals(a: ParcelCoord, b: ParcelCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function placesReducer(state: PlacesState, action: PlacesAction): PlacesState {
  switch (action.type) {
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        sidebarOpen: action.payload === 'groups' ? true : state.sidebarOpen,
        selectedParcels: action.payload === 'groups' ? state.selectedParcels : [],
        selectionColor: action.payload === 'groups' ? state.selectionColor : null,
        editingPlaceId: action.payload === 'groups' ? state.editingPlaceId : null,
      };

    case 'ADD_PLACE':
      return {
        ...state,
        places: [...state.places, action.payload],
        selectedParcels: [],
        selectionColor: null,
        isLoading: false,
        error: null,
      };

    case 'UPDATE_PLACE':
      return {
        ...state,
        places: state.places.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
        editingPlaceId: null,
        isLoading: false,
        error: null,
      };

    case 'DELETE_PLACE':
      return {
        ...state,
        places: state.places.filter((p) => p.id !== action.payload),
        editingPlaceId:
          state.editingPlaceId === action.payload ? null : state.editingPlaceId,
        isLoading: false,
        error: null,
      };

    case 'ADD_PLACE_GROUP':
      return {
        ...state,
        placeGroups: [...state.placeGroups, action.payload],
        isLoading: false,
        error: null,
      };

    case 'UPDATE_PLACE_GROUP':
      return {
        ...state,
        placeGroups: state.placeGroups.map((g) =>
          g.id === action.payload.id ? action.payload : g
        ),
        isLoading: false,
        error: null,
      };

    case 'DELETE_PLACE_GROUP':
      return {
        ...state,
        placeGroups: state.placeGroups.filter((g) => g.id !== action.payload),
        isLoading: false,
        error: null,
      };

    case 'SET_SELECTED_PARCELS':
      return {
        ...state,
        selectedParcels: action.payload,
      };

    case 'TOGGLE_PARCEL_SELECTION': {
      const parcel = action.payload;
      const isSelected = state.selectedParcels.some((p) =>
        parcelEquals(p, parcel)
      );

      return {
        ...state,
        selectedParcels: isSelected
          ? state.selectedParcels.filter((p) => !parcelEquals(p, parcel))
          : [...state.selectedParcels, parcel],
      };
    }

    case 'CLEAR_SELECTION':
      return {
        ...state,
        selectedParcels: [],
        selectionColor: null,
      };

    case 'SET_EDITING_PLACE':
      return {
        ...state,
        editingPlaceId: action.payload,
        sidebarOpen: action.payload !== null ? true : state.sidebarOpen,
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        sidebarOpen: !state.sidebarOpen,
      };

    case 'SET_SIDEBAR_OPEN':
      return {
        ...state,
        sidebarOpen: action.payload,
      };

    case 'SET_SELECTION_COLOR':
      return {
        ...state,
        selectionColor: action.payload,
      };

    case 'LOAD_PLACES':
      return {
        ...state,
        places: action.payload,
        isLoading: false,
        error: null,
      };

    case 'LOAD_PLACE_GROUPS':
      return {
        ...state,
        placeGroups: action.payload,
        isLoading: false,
        error: null,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    default:
      return state;
  }
}

interface PlacesProviderProps {
  children: ReactNode;
}

export function PlacesProvider({ children }: PlacesProviderProps) {
  const [state, dispatch] = useReducer(placesReducer, initialState);
  const authenticatedFetch = useAuthenticatedFetch();
  const { isSignedIn } = useAuth();

  const loadPlaces = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const places = await api.fetchBackofficePlaces(authenticatedFetch);
      dispatch({ type: 'LOAD_PLACES', payload: places });
    } catch (error) {
      console.error('Failed to load places:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to load places' });
    }
  }, [authenticatedFetch]);

  const loadPlaceGroups = useCallback(async () => {
    try {
      const groups = await api.fetchBackofficePlaceGroups(authenticatedFetch);
      dispatch({ type: 'LOAD_PLACE_GROUPS', payload: groups });
    } catch (error) {
      console.error('Failed to load place groups:', error);
    }
  }, [authenticatedFetch]);

  // Load places and groups from API when signed in (or in dev mode)
  useEffect(() => {
    const canLoad = isSignedIn || isDevMode();

    if (!canLoad) {
      dispatch({ type: 'LOAD_PLACES', payload: [] });
      dispatch({ type: 'LOAD_PLACE_GROUPS', payload: [] });
      return;
    }

    loadPlaces();
    loadPlaceGroups();
  }, [isSignedIn, loadPlaces, loadPlaceGroups]);

  const createPlace = useCallback(async (input: api.CreatePlaceInput): Promise<Place | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const place = await api.createPlace(authenticatedFetch, input);
      dispatch({ type: 'ADD_PLACE', payload: place });
      dispatch({ type: 'CLEAR_SELECTION' });
      return place;
    } catch (error) {
      console.error('Failed to create place:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to create place' });
      return null;
    }
  }, [authenticatedFetch]);

  const updatePlace = useCallback(async (id: string, input: api.UpdatePlaceInput): Promise<Place | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const place = await api.updatePlace(authenticatedFetch, id, input);
      dispatch({ type: 'UPDATE_PLACE', payload: place });
      return place;
    } catch (error) {
      console.error('Failed to update place:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to update place' });
      return null;
    }
  }, [authenticatedFetch]);

  const deletePlace = useCallback(async (id: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await api.deletePlace(authenticatedFetch, id);
      dispatch({ type: 'DELETE_PLACE', payload: id });
      return true;
    } catch (error) {
      console.error('Failed to delete place:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to delete place' });
      return false;
    }
  }, [authenticatedFetch]);

  const setPlaceGroupFn = useCallback(async (placeId: string, groupId: string): Promise<Place | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const place = await api.setPlaceGroup(authenticatedFetch, placeId, groupId);
      dispatch({ type: 'UPDATE_PLACE', payload: place });
      return place;
    } catch (error) {
      console.error('Failed to assign place to group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to assign place to group' });
      return null;
    }
  }, [authenticatedFetch]);

  const removePlaceGroupFn = useCallback(async (placeId: string): Promise<Place | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const place = await api.removePlaceGroup(authenticatedFetch, placeId);
      dispatch({ type: 'UPDATE_PLACE', payload: place });
      return place;
    } catch (error) {
      console.error('Failed to remove place from group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to remove place from group' });
      return null;
    }
  }, [authenticatedFetch]);

  const createPlaceGroup = useCallback(async (input: api.CreatePlaceGroupInput): Promise<PlaceGroup | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const group = await api.createPlaceGroup(authenticatedFetch, input);
      dispatch({ type: 'ADD_PLACE_GROUP', payload: group });
      return group;
    } catch (error) {
      console.error('Failed to create place group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to create place group' });
      return null;
    }
  }, [authenticatedFetch]);

  const updatePlaceGroupFn = useCallback(async (id: string, input: api.UpdatePlaceGroupInput): Promise<PlaceGroup | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const group = await api.updatePlaceGroup(authenticatedFetch, id, input);
      dispatch({ type: 'UPDATE_PLACE_GROUP', payload: group });
      return group;
    } catch (error) {
      console.error('Failed to update place group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to update place group' });
      return null;
    }
  }, [authenticatedFetch]);

  const deletePlaceGroup = useCallback(async (id: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await api.deletePlaceGroup(authenticatedFetch, id);
      dispatch({ type: 'DELETE_PLACE_GROUP', payload: id });
      return true;
    } catch (error) {
      console.error('Failed to delete place group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to delete place group' });
      return false;
    }
  }, [authenticatedFetch]);

  return (
    <PlacesContext.Provider value={{
      state,
      dispatch,
      createPlace,
      updatePlace,
      deletePlace,
      setPlaceGroup: setPlaceGroupFn,
      removePlaceGroup: removePlaceGroupFn,
      createPlaceGroup,
      updatePlaceGroup: updatePlaceGroupFn,
      deletePlaceGroup,
      reloadPlaces: loadPlaces,
      reloadPlaceGroups: loadPlaceGroups,
    }}>
      {children}
    </PlacesContext.Provider>
  );
}
