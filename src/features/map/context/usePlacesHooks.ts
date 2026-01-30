import { useContext } from 'react';
import { PlacesContext } from './placesContextDef';
import type { PlacesContextValue } from './placesContextDef';

export function usePlacesContext(): PlacesContextValue {
  const context = useContext(PlacesContext);
  if (!context) {
    throw new Error('usePlacesContext must be used within a PlacesProvider');
  }
  return context;
}

export function usePlacesState() {
  const { state } = usePlacesContext();
  return state;
}

export function usePlacesDispatch() {
  const { dispatch } = usePlacesContext();
  return dispatch;
}

export function usePlacesApi() {
  const {
    createPlace,
    updatePlace,
    deletePlace,
    setPlaceGroup,
    removePlaceGroup,
    createPlaceGroup,
    updatePlaceGroup,
    deletePlaceGroup,
    reloadPlaces,
    reloadPlaceGroups,
  } = usePlacesContext();

  return {
    createPlace,
    updatePlace,
    deletePlace,
    setPlaceGroup,
    removePlaceGroup,
    createPlaceGroup,
    updatePlaceGroup,
    deletePlaceGroup,
    reloadPlaces,
    reloadPlaceGroups,
  };
}
