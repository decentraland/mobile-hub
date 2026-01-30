import { config } from '../../../config'
import type { SceneGroup, ParcelCoord, Tag } from '../types'

const API_BASE = config.get('MOBILE_BFF_URL')

export interface CreateSceneGroupInput {
  name: string
  description?: string
  color: string
  tags?: string[]
  parcels?: ParcelCoord[]
  worldName?: string
}

export interface UpdateSceneGroupInput {
  name?: string
  description?: string
  color?: string
  tags?: string[]
  parcels?: ParcelCoord[]
  worldName?: string | null
}

// Backend response types
interface ApiSceneGroup {
  id: string
  name: string
  description: string | null
  color: string
  tags: string[]
  parcels: ParcelCoord[]
  worldName: string | null
  createdAt: string
  updatedAt: string
}

interface ApiTag {
  id: string
  name: string
  description: string | null
  createdAt: string
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

function transformSceneGroup(data: ApiSceneGroup): SceneGroup {
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    color: data.color,
    tags: data.tags || [],
    parcels: data.parcels || [],
    worldName: data.worldName,
    createdAt: new Date(data.createdAt).getTime(),
    updatedAt: new Date(data.updatedAt).getTime(),
  }
}

function transformTag(data: ApiTag): Tag {
  return {
    id: data.id,
    name: data.name,
    description: data.description || undefined,
    createdAt: new Date(data.createdAt).getTime(),
  }
}

export async function fetchAllSceneGroups(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<SceneGroup[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/scene-groups`)
  const json: ApiResponse<ApiSceneGroup[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch scene groups')
  }

  return (json.data || []).map(transformSceneGroup)
}

export async function createSceneGroup(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  input: CreateSceneGroupInput
): Promise<SceneGroup> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/scene-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiSceneGroup> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create scene group')
  }

  return transformSceneGroup(json.data)
}

export async function updateSceneGroup(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  id: string,
  input: UpdateSceneGroupInput
): Promise<SceneGroup> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/scene-groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiSceneGroup> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to update scene group')
  }

  return transformSceneGroup(json.data)
}

export async function deleteSceneGroup(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  id: string
): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/scene-groups/${id}`, {
    method: 'DELETE',
  })
  const json: ApiResponse<{ id: string }> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to delete scene group')
  }
}

// Public endpoint - no auth required
export async function fetchAllTags(): Promise<Tag[]> {
  const response = await fetch(`${API_BASE}/tags`)
  const json: ApiResponse<ApiTag[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch tags')
  }

  return (json.data || []).map(transformTag)
}

// Public endpoint - supports multiple tag filtering (comma-separated, AND logic)
export async function fetchSceneGroupsByTags(tags?: string[]): Promise<SceneGroup[]> {
  const url = tags && tags.length > 0
    ? `${API_BASE}/scene-groups?tag=${tags.map(t => encodeURIComponent(t)).join(',')}`
    : `${API_BASE}/scene-groups`
  const response = await fetch(url)
  const json: ApiResponse<ApiSceneGroup[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch scene groups')
  }

  return (json.data || []).map(transformSceneGroup)
}

// Deprecated: use fetchSceneGroupsByTags instead
export async function fetchSceneGroupsByTag(tagName?: string): Promise<SceneGroup[]> {
  return fetchSceneGroupsByTags(tagName ? [tagName] : undefined)
}

export async function fetchSceneGroupByWorldName(
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  worldName: string
): Promise<SceneGroup | null> {
  const response = await authenticatedFetch(
    `${API_BASE}/backoffice/scene-groups?worldName=${encodeURIComponent(worldName)}`
  )
  const json: ApiResponse<ApiSceneGroup | null> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch scene group by world name')
  }

  return json.data ? transformSceneGroup(json.data) : null
}
