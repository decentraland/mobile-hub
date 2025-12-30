import { useReducer, useEffect, type ReactNode } from 'react';
import { GroupsContext } from './groupsContextDef';
import type { GroupsState, GroupsAction, ParcelCoord } from '../types';

const STORAGE_KEY = 'decentraland-map-groups';

const initialState: GroupsState = {
  mode: 'view',
  groups: [],
  selectedParcels: [],
  selectionColor: null,
  editingGroupId: null,
  sidebarOpen: false,
};

function parcelEquals(a: ParcelCoord, b: ParcelCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function groupsReducer(state: GroupsState, action: GroupsAction): GroupsState {
  switch (action.type) {
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        // When entering groups mode, open sidebar
        sidebarOpen: action.payload === 'groups' ? true : state.sidebarOpen,
        // When leaving groups mode, clear selection
        selectedParcels: action.payload === 'groups' ? state.selectedParcels : [],
        selectionColor: action.payload === 'groups' ? state.selectionColor : null,
        editingGroupId: action.payload === 'groups' ? state.editingGroupId : null,
      };

    case 'ADD_GROUP':
      return {
        ...state,
        groups: [...state.groups, action.payload],
        selectedParcels: [],
        selectionColor: null,
      };

    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.id ? action.payload : g
        ),
        editingGroupId: null,
      };

    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload),
        editingGroupId:
          state.editingGroupId === action.payload ? null : state.editingGroupId,
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

    case 'SET_EDITING_GROUP':
      return {
        ...state,
        editingGroupId: action.payload,
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

    case 'LOAD_GROUPS':
      return {
        ...state,
        groups: action.payload,
      };

    default:
      return state;
  }
}

interface GroupsProviderProps {
  children: ReactNode;
}

export function GroupsProvider({ children }: GroupsProviderProps) {
  const [state, dispatch] = useReducer(groupsReducer, initialState);

  // Load groups from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const groups = JSON.parse(stored);
        dispatch({ type: 'LOAD_GROUPS', payload: groups });
      }
    } catch (e) {
      console.error('Failed to load groups from localStorage:', e);
    }
  }, []);

  // Save groups to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.groups));
    } catch (e) {
      console.error('Failed to save groups to localStorage:', e);
    }
  }, [state.groups]);

  return (
    <GroupsContext.Provider value={{ state, dispatch }}>
      {children}
    </GroupsContext.Provider>
  );
}
