import type { ParcelCoord, SceneGroup } from '../types';

// Predefined color palette for groups
export const GROUP_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky Blue
];

export function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getNextColor(existingGroups: SceneGroup[]): string {
  const usedColors = new Set(existingGroups.map((g) => g.color));
  const availableColor = GROUP_COLORS.find((c) => !usedColors.has(c));
  return availableColor || GROUP_COLORS[existingGroups.length % GROUP_COLORS.length];
}

export function parcelEquals(a: ParcelCoord, b: ParcelCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function parcelKey(parcel: ParcelCoord): string {
  return `${parcel.x},${parcel.y}`;
}

export function parseParcelKey(key: string): ParcelCoord {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function findGroupForParcel(
  parcel: ParcelCoord,
  groups: SceneGroup[]
): SceneGroup | undefined {
  return groups.find((group) =>
    group.parcels.some((p) => parcelEquals(p, parcel))
  );
}

export function createGroup(
  parcels: ParcelCoord[],
  name: string,
  existingGroups: SceneGroup[],
  options?: {
    description?: string;
    color?: string;
    tags?: string[];
  }
): SceneGroup {
  const now = Date.now();
  return {
    id: generateGroupId(),
    name,
    description: options?.description || '',
    color: options?.color || getNextColor(existingGroups),
    tags: options?.tags || [],
    parcels: [...parcels],
    createdAt: now,
    updatedAt: now,
  };
}
