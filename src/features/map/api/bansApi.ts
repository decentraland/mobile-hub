import { config } from '../../../config'
import type { ParcelCoord } from '../types'

const API_BASE = config.get('MOBILE_BFF_URL')

export interface Ban {
  id: string
  groupId: string | null  // If set, it's a group ban
  worldName: string | null  // If set, it's a world ban
  parcels: ParcelCoord[]  // For scene bans, the parcels that identify the scene
  sceneId: string | null  // Entity ID at ban time (for detecting redeploys)
  reason?: string
  createdAt: number
  createdBy?: string
}

export interface CreateGroupBanInput {
  groupId: string
  reason?: string
}

export interface CreateSceneBanInput {
  parcels: ParcelCoord[]
  sceneId?: string  // Entity ID of the scene at ban time
  reason?: string
}

export interface CreateWorldBanInput {
  worldName: string
  sceneId?: string  // Entity ID of the world at ban time
  reason?: string
}

// Backend response types
interface ApiBan {
  id: string
  groupId: string | null
  worldName: string | null
  parcels: ParcelCoord[]
  sceneId: string | null
  reason?: string
  createdAt: number
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
    groupId: data.groupId,
    worldName: data.worldName,
    parcels: data.parcels || [],
    sceneId: data.sceneId,
    reason: data.reason || undefined,
    createdAt: data.createdAt,
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
 * Create a group ban
 */
export async function createGroupBan(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  input: CreateGroupBanInput
): Promise<Ban> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiBan> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create group ban')
  }

  return transformBan(json.data)
}

/**
 * Create a scene ban
 */
export async function createSceneBan(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  input: CreateSceneBanInput
): Promise<Ban> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiBan> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create scene ban')
  }

  return transformBan(json.data)
}

/**
 * Create a world ban
 */
export async function createWorldBan(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  input: CreateWorldBanInput
): Promise<Ban> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiBan> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create world ban')
  }

  return transformBan(json.data)
}

/**
 * Delete a ban (unban a group, scene, or world)
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
  return bans.some(ban => ban.groupId === groupId)
}

/**
 * Check if a scene (by parcels) is banned
 */
export function isSceneBanned(bans: Ban[], parcels: ParcelCoord[]): boolean {
  if (parcels.length === 0) return false
  const sceneKey = generateParcelKey(parcels)
  return bans.some(ban => ban.groupId === null && ban.worldName === null && generateParcelKey(ban.parcels) === sceneKey)
}

/**
 * Check if a world is banned
 */
export function isWorldBanned(bans: Ban[], worldName: string): boolean {
  const normalizedName = worldName.trim().toLowerCase()
  return bans.some(ban => ban.worldName === normalizedName)
}

/**
 * Get the ban for a group (if exists)
 */
export function getBanForGroup(bans: Ban[], groupId: string): Ban | undefined {
  return bans.find(ban => ban.groupId === groupId)
}

/**
 * Get the ban for a scene (if exists)
 */
export function getBanForScene(bans: Ban[], parcels: ParcelCoord[]): Ban | undefined {
  if (parcels.length === 0) return undefined
  const sceneKey = generateParcelKey(parcels)
  return bans.find(ban => ban.groupId === null && ban.worldName === null && generateParcelKey(ban.parcels) === sceneKey)
}

/**
 * Get the ban for a world (if exists)
 */
export function getBanForWorld(bans: Ban[], worldName: string): Ban | undefined {
  const normalizedName = worldName.trim().toLowerCase()
  return bans.find(ban => ban.worldName === normalizedName)
}

/**
 * Generate a unique key from parcels (for comparison)
 */
export function generateParcelKey(parcels: ParcelCoord[]): string {
  return parcels.map(p => `${p.x},${p.y}`).sort().join('|')
}
