import { createContext, type Dispatch } from 'react';
import type { GroupsState, GroupsAction } from '../types';

export interface GroupsContextValue {
  state: GroupsState;
  dispatch: Dispatch<GroupsAction>;
}

export const GroupsContext = createContext<GroupsContextValue | null>(null);
