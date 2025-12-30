import { useGroupsState, useGroupsDispatch } from '../../context/useGroupsHooks';
import { GroupCard } from './GroupCard';
import type { SceneGroup } from '../../types';
import styles from './GroupsSidebar.module.css';

interface GroupsListProps {
  onEditGroup: (group: SceneGroup) => void;
}

export function GroupsList({ onEditGroup }: GroupsListProps) {
  const { groups } = useGroupsState();
  const dispatch = useGroupsDispatch();

  const handleDelete = (groupId: string) => {
    dispatch({ type: 'DELETE_GROUP', payload: groupId });
  };

  const handleClick = (group: SceneGroup) => {
    dispatch({ type: 'SET_EDITING_GROUP', payload: group.id });
  };

  if (groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>&#9633;</div>
        <p className={styles.emptyStateText}>
          No groups yet. Click parcels on the map to select them, then create a group.
        </p>
      </div>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          onEdit={onEditGroup}
          onDelete={handleDelete}
          onClick={handleClick}
        />
      ))}
    </div>
  );
}
