import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBansState, useBansApi } from '../../context/useBansHooks';
import { fetchSceneByParcel } from '../../api/sceneApi';
import type { Ban } from '../../api/bansApi';
import styles from './BannedScenesSidebar.module.css';

interface BannedScenesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onBanClick?: (ban: Ban) => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatParcels(parcels: { x: number; y: number }[]): string {
  if (parcels.length === 0) return '';
  if (parcels.length === 1) return `${parcels[0].x},${parcels[0].y}`;
  return `${parcels[0].x},${parcels[0].y} (+${parcels.length - 1} more)`;
}

function getBanTitle(ban: Ban): string {
  if (ban.groupId) {
    return 'Group Ban';
  }
  if (ban.worldName) {
    return ban.worldName;
  }
  return formatParcels(ban.parcels);
}

function getBanType(ban: Ban): string {
  if (ban.groupId) return 'Group';
  if (ban.worldName) return 'World';
  return 'Scene';
}

export function BannedScenesSidebar({ isOpen, onClose, onBanClick }: BannedScenesSidebarProps) {
  const { bans, isLoading, error } = useBansState();
  const { unbanGroup, unbanScene, unbanWorld } = useBansApi();
  const [redeployedBans, setRedeployedBans] = useState<Set<string>>(new Set());

  // Filter out world bans - only show scene and group bans
  const sceneBans = bans.filter(ban => !ban.worldName);

  // Check for redeployed scenes when sidebar opens
  useEffect(() => {
    if (!isOpen) return;

    const checkRedeployments = async () => {
      const redeployed = new Set<string>();

      for (const ban of sceneBans) {
        // Only check scene bans that have a sceneId stored
        if (ban.sceneId && ban.parcels.length > 0) {
          try {
            const currentScene = await fetchSceneByParcel(ban.parcels[0]);
            if (currentScene && currentScene.entityId !== ban.sceneId) {
              redeployed.add(ban.id);
            }
          } catch (err) {
            console.error('Error checking scene redeployment:', err);
          }
        }
      }

      setRedeployedBans(redeployed);
    };

    checkRedeployments();
  }, [isOpen, sceneBans]);

  // Handle Escape key to close sidebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleUnban = async (ban: Ban, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (ban.groupId) {
        await unbanGroup({ id: ban.groupId } as any);
      } else if (ban.worldName) {
        await unbanWorld(ban.worldName);
      } else if (ban.parcels.length > 0) {
        await unbanScene(ban.parcels);
      }
    } catch (err) {
      console.error('Failed to unban:', err);
    }
  };

  const handleBanClick = (ban: Ban) => {
    onBanClick?.(ban);
  };

  const sidebarClass = `${styles.sidebar} ${!isOpen ? styles.sidebarCollapsed : ''}`;

  const sidebarContent = (
    <div className={sidebarClass}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>
          <span>Banned Scenes</span>
        </h3>
        <button className={styles.closeButton} onClick={onClose}>
          x
        </button>
      </div>

      <div className={styles.content}>
        {isLoading && (
          <div className={styles.loadingState}>Loading bans...</div>
        )}

        {error && (
          <div className={styles.errorState}>{error}</div>
        )}

        {!isLoading && !error && sceneBans.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>🛡️</div>
            <p className={styles.emptyStateText}>No banned scenes</p>
          </div>
        )}

        {!isLoading && !error && sceneBans.map((ban) => (
          <div
            key={ban.id}
            className={styles.banCard}
            onClick={() => handleBanClick(ban)}
          >
            <div className={styles.banCardHeader}>
              <div className={styles.banIcon} />
              <h4 className={styles.banTitle}>{getBanTitle(ban)}</h4>
              <span className={styles.banType}>{getBanType(ban)}</span>
            </div>

            <div className={styles.banMeta}>
              Banned on {formatDate(ban.createdAt)}
              {ban.createdBy && ` by ${ban.createdBy.slice(0, 6)}...${ban.createdBy.slice(-4)}`}
            </div>

            {ban.parcels.length > 1 && (
              <div className={styles.banMeta}>
                {ban.parcels.length} parcels
              </div>
            )}

            {redeployedBans.has(ban.id) && (
              <div className={styles.redeployWarning}>
                Scene has been re-deployed since ban
              </div>
            )}

            {ban.reason && (
              <div className={styles.banReason}>
                "{ban.reason}"
              </div>
            )}

            <div className={styles.banActions}>
              <button
                className={styles.actionButton}
                onClick={(e) => handleUnban(ban, e)}
              >
                Unban
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(sidebarContent, document.body);
}
