import type { Place } from '../../types';
import styles from './PlacesSidebar.module.css';

interface PlaceCardProps {
  place: Place;
  onEdit: (place: Place) => void;
  onDelete: (placeId: string) => void;
  onClick: (place: Place) => void;
  isBanned?: boolean;
  onBanToggle?: (place: Place, shouldBan: boolean) => void;
}

export function PlaceCard({ place, onEdit, onDelete, onClick, isBanned = false, onBanToggle }: PlaceCardProps) {
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(place);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const displayName = place.type === 'world' ? place.worldName : `Scene at ${place.basePosition}`;
    if (confirm(`Delete place "${displayName}"?`)) {
      onDelete(place.id);
    }
  };

  const handleBanToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBanToggle?.(place, !isBanned);
  };

  const displayName = place.type === 'world'
    ? place.worldName || 'Unknown World'
    : place.groupName || `Scene at ${place.basePosition}`;

  const displayColor = place.groupColor || '#6366f1';

  const parcelCount = place.positions?.length || 0;
  const metaText = place.type === 'world'
    ? 'World'
    : `${parcelCount} parcel${parcelCount !== 1 ? 's' : ''}`;

  return (
    <div className={`${styles.groupCard} ${isBanned ? styles.groupCardBanned : ''}`} onClick={() => onClick(place)}>
      <div className={styles.groupCardHeader}>
        <div
          className={styles.groupColorDot}
          style={{ backgroundColor: displayColor }}
        />
        <h4 className={styles.groupName}>
          {displayName}
          {isBanned && <span className={styles.bannedBadge}>Banned</span>}
        </h4>
        <span className={`${styles.typeBadge} ${place.type === 'world' ? styles.typeBadgeWorld : styles.typeBadgeScene}`}>
          {place.type}
        </span>
      </div>

      <p className={styles.groupMeta}>
        {metaText}
      </p>

      {place.tags.length > 0 && (
        <div className={styles.groupTags}>
          {place.tags.map((tag) => (
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
        <button
          className={`${styles.actionButton} ${isBanned ? styles.actionButtonUnban : styles.actionButtonBan}`}
          onClick={handleBanToggle}
        >
          {isBanned ? 'Unban' : 'Ban'}
        </button>
        <button className={styles.actionButton} onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
