import { useContext, type Dispatch } from 'react';
import type { GroupsState, GroupsAction } from '../types';
import { GroupsContext, type GroupsContextValue } from './groupsContextDef';

export function useGroupsContext(): GroupsContextValue {
  const context = useContext(GroupsContext);
  if (!context) {
    throw new Error('useGroupsContext must be used within a GroupsProvider');
  }
  return context;
}

export function useGroupsState(): GroupsState {
  return useGroupsContext().state;
}

export function useGroupsDispatch(): Dispatch<GroupsAction> {
  return useGroupsContext().dispatch;
}
