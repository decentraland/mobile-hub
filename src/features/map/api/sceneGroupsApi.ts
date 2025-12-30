import { config } from '../../../config'
import type { SceneGroup, ParcelCoord } from '../types'

const API_BASE = config.get('MOBILE_BFF_URL')

export interface CreateSceneGroupInput {
  name: string
  description?: string
  color: string
  tags?: string[]
  parcels: ParcelCoord[]
}

export interface UpdateSceneGroupInput {
  name?: string
  description?: string
  color?: string
  tags?: string[]
  parcels?: ParcelCoord[]
}

// Backend response types
interface ApiSceneGroup {
  id: string
  name: string
  description: string | null
  color: string
  tags: string[]
  parcels: ParcelCoord[]
  createdAt: string
  updatedAt: string
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
    createdAt: new Date(data.createdAt).getTime(),
    updatedAt: new Date(data.updatedAt).getTime(),
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
