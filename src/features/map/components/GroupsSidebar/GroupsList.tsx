import { useGroupsState, useGroupsDispatch, useGroupsApi } from '../../context/useGroupsHooks';
import { useMapDispatch } from '../../context/useMapHooks';
import { GroupCard } from './GroupCard';
import type { SceneGroup } from '../../types';
import styles from './GroupsSidebar.module.css';

interface GroupsListProps {
  onEditGroup: (group: SceneGroup) => void;
}

export function GroupsList({ onEditGroup }: GroupsListProps) {
  const { groups, isLoading, error } = useGroupsState();
  const dispatch = useGroupsDispatch();
  const mapDispatch = useMapDispatch();
  const { deleteGroup } = useGroupsApi();

  const handleDelete = async (groupId: string) => {
    await deleteGroup(groupId);
  };

  const handleClick = (group: SceneGroup) => {
    dispatch({ type: 'SET_EDITING_GROUP', payload: group.id });

    // Zoom map to show the group's parcels
    if (group.parcels.length > 0) {
      // Calculate bounding box of all parcels
      const xs = group.parcels.map(p => p.x);
      const ys = group.parcels.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Center on the middle of the bounding box
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      mapDispatch({ type: 'SET_CENTER', payload: { x: centerX, y: centerY } });
      mapDispatch({ type: 'SET_ZOOM', payload: 4 });
    }
  };

  if (isLoading && groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText}>Loading groups...</p>
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText} style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      </div>
    );
  }

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
