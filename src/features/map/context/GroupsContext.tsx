import { useReducer, useEffect, useCallback, type ReactNode } from 'react';
import { GroupsContext } from './groupsContextDef';
import { useAuthenticatedFetch } from '../../../hooks/useAuthenticatedFetch';
import { useAuth } from '../../../contexts/auth';
import { isDevMode } from '../../../utils/devIdentity';
import * as api from '../api/sceneGroupsApi';
import type { GroupsState, GroupsAction, ParcelCoord, SceneGroup } from '../types';

const initialState: GroupsState = {
  mode: 'view',
  groups: [],
  selectedParcels: [],
  selectionColor: null,
  editingGroupId: null,
  sidebarOpen: false,
  isLoading: false,
  error: null,
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
        sidebarOpen: action.payload === 'groups' ? true : state.sidebarOpen,
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
        isLoading: false,
        error: null,
      };

    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.id ? action.payload : g
        ),
        editingGroupId: null,
        isLoading: false,
        error: null,
      };

    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload),
        editingGroupId:
          state.editingGroupId === action.payload ? null : state.editingGroupId,
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

interface GroupsProviderProps {
  children: ReactNode;
}

export function GroupsProvider({ children }: GroupsProviderProps) {
  const [state, dispatch] = useReducer(groupsReducer, initialState);
  const authenticatedFetch = useAuthenticatedFetch();
  const { isSignedIn } = useAuth();

  // Load groups from API when signed in (or in dev mode)
  useEffect(() => {
    const canLoad = isSignedIn || isDevMode();

    if (!canLoad) {
      dispatch({ type: 'LOAD_GROUPS', payload: [] });
      return;
    }

    const loadGroups = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const groups = await api.fetchAllSceneGroups(authenticatedFetch);
        dispatch({ type: 'LOAD_GROUPS', payload: groups });
      } catch (error) {
        console.error('Failed to load groups:', error);
        dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to load groups' });
      }
    };

    loadGroups();
  }, [isSignedIn, authenticatedFetch]);

  const createGroup = useCallback(async (input: api.CreateSceneGroupInput): Promise<SceneGroup | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const group = await api.createSceneGroup(authenticatedFetch, input);
      dispatch({ type: 'ADD_GROUP', payload: group });
      dispatch({ type: 'CLEAR_SELECTION' });
      return group;
    } catch (error) {
      console.error('Failed to create group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to create group' });
      return null;
    }
  }, [authenticatedFetch]);

  const updateGroup = useCallback(async (id: string, input: api.UpdateSceneGroupInput): Promise<SceneGroup | null> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const group = await api.updateSceneGroup(authenticatedFetch, id, input);
      dispatch({ type: 'UPDATE_GROUP', payload: group });
      return group;
    } catch (error) {
      console.error('Failed to update group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to update group' });
      return null;
    }
  }, [authenticatedFetch]);

  const deleteGroup = useCallback(async (id: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await api.deleteSceneGroup(authenticatedFetch, id);
      dispatch({ type: 'DELETE_GROUP', payload: id });
      return true;
    } catch (error) {
      console.error('Failed to delete group:', error);
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to delete group' });
      return false;
    }
  }, [authenticatedFetch]);

  return (
    <GroupsContext.Provider value={{ state, dispatch, createGroup, updateGroup, deleteGroup }}>
      {children}
    </GroupsContext.Provider>
  );
}
