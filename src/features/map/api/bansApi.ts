import { config } from '../../../config'
import type { ParcelCoord } from '../types'

const API_BASE = config.get('MOBILE_BFF_URL')

// Ban target type - either a group or a scene (identified by parcels)
export type BanTargetType = 'group' | 'scene'

export interface Ban {
  id: string
  targetType: BanTargetType
  targetId: string // groupId for groups, parcel key for scenes
  parcels?: ParcelCoord[] // For scene bans, the parcels that make up the scene
  reason?: string
  createdAt: number
  createdBy?: string
}

export interface CreateBanInput {
  targetType: BanTargetType
  targetId: string
  parcels?: ParcelCoord[]
  reason?: string
}

// Backend response types
interface ApiBan {
  id: string
  targetType: BanTargetType
  targetId: string
  parcels?: ParcelCoord[]
  reason?: string
  createdAt: string
  createdBy?: string
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

function transformBan(data: ApiBan): Ban {
  return {
    id: data.id,
    targetType: data.targetType,
    targetId: data.targetId,
    parcels: data.parcels,
    reason: data.reason || undefined,
    createdAt: new Date(data.createdAt).getTime(),
    createdBy: data.createdBy,
  }
}

/**
 * Fetch all bans
 */
export async function fetchAllBans(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<Ban[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans`)
  const json: ApiResponse<ApiBan[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch bans')
  }

  return (json.data || []).map(transformBan)
}

/**
 * Create a new ban (ban a group or scene)
 */
export async function createBan(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  input: CreateBanInput
): Promise<Ban> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiBan> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create ban')
  }

  return transformBan(json.data)
}

/**
 * Delete a ban (unban a group or scene)
 */
export async function deleteBan(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  banId: string
): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans/${banId}`, {
    method: 'DELETE',
  })
  const json: ApiResponse<{ id: string }> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to delete ban')
  }
}

/**
 * Check if a group is banned
 */
export function isGroupBanned(bans: Ban[], groupId: string): boolean {
  return bans.some(ban => ban.targetType === 'group' && ban.targetId === groupId)
}

/**
 * Check if a scene (by parcels) is banned
 */
export function isSceneBanned(bans: Ban[], parcels: ParcelCoord[]): boolean {
  if (parcels.length === 0) return false
  const sceneKey = parcels.map(p => `${p.x},${p.y}`).sort().join('|')
  return bans.some(ban => ban.targetType === 'scene' && ban.targetId === sceneKey)
}

/**
 * Get the ban for a group (if exists)
 */
export function getBanForGroup(bans: Ban[], groupId: string): Ban | undefined {
  return bans.find(ban => ban.targetType === 'group' && ban.targetId === groupId)
}

/**
 * Get the ban for a scene (if exists)
 */
export function getBanForScene(bans: Ban[], parcels: ParcelCoord[]): Ban | undefined {
  if (parcels.length === 0) return undefined
  const sceneKey = parcels.map(p => `${p.x},${p.y}`).sort().join('|')
  return bans.find(ban => ban.targetType === 'scene' && ban.targetId === sceneKey)
}

/**
 * Generate a scene key from parcels (for use as targetId)
 */
export function generateSceneKey(parcels: ParcelCoord[]): string {
  return parcels.map(p => `${p.x},${p.y}`).sort().join('|')
}
