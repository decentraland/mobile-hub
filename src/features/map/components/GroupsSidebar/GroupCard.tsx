import type { SceneGroup } from '../../types';
import styles from './GroupsSidebar.module.css';

interface GroupCardProps {
  group: SceneGroup;
  onEdit: (group: SceneGroup) => void;
  onDelete: (groupId: string) => void;
  onClick: (group: SceneGroup) => void;
}

export function GroupCard({ group, onEdit, onDelete, onClick }: GroupCardProps) {
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(group);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete group "${group.name}"?`)) {
      onDelete(group.id);
    }
  };

  return (
    <div className={styles.groupCard} onClick={() => onClick(group)}>
      <div className={styles.groupCardHeader}>
        <div
          className={styles.groupColorDot}
          style={{ backgroundColor: group.color }}
        />
        <h4 className={styles.groupName}>{group.name}</h4>
      </div>

      <p className={styles.groupMeta}>
        {group.parcels.length} parcel{group.parcels.length !== 1 ? 's' : ''}
        {group.description && ` • ${group.description}`}
      </p>

      {group.tags.length > 0 && (
        <div className={styles.groupTags}>
          {group.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={styles.groupActions}>
        <button className={styles.actionButton} onClick={handleEdit}>
          Edit
        </button>
        <button className={styles.actionButton} onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
