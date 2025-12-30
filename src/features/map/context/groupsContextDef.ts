import { createContext, type Dispatch } from 'react';
import type { GroupsState, GroupsAction, SceneGroup, ParcelCoord } from '../types';

export interface CreateSceneGroupInput {
  name: string;
  description?: string;
  color: string;
  tags?: string[];
  parcels: ParcelCoord[];
}

export interface UpdateSceneGroupInput {
  name?: string;
  description?: string;
  color?: string;
  tags?: string[];
  parcels?: ParcelCoord[];
}

export interface GroupsContextValue {
  state: GroupsState;
  dispatch: Dispatch<GroupsAction>;
  createGroup: (input: CreateSceneGroupInput) => Promise<SceneGroup | null>;
  updateGroup: (id: string, input: UpdateSceneGroupInput) => Promise<SceneGroup | null>;
  deleteGroup: (id: string) => Promise<boolean>;
}

export const GroupsContext = createContext<GroupsContextValue | null>(null);
