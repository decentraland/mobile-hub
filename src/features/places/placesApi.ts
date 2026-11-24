import { config } from '../../config'
import type { Place, PlaceType, PlaceWithBanStatus, Tag } from './types'

const API_BASE = config.get('MOBILE_BFF_URL')

type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface CreatePlaceInput {
  type: PlaceType
  name?: string  // Scene/world title
  basePosition?: string  // "x,y" format
  worldName?: string
  sceneId?: string
  groupId?: string
  tags?: string[]
  positions?: string[]  // ["x,y", "x,y"] format
}

export interface UpdatePlaceInput {
  name?: string | null
  basePosition?: string
  worldName?: string
  sceneId?: string | null
  groupId?: string | null
  tags?: string[]
  positions?: string[]
}

// Backend response types
interface ApiPlace {
  id: string
  type: PlaceType
  name: string | null
  basePosition: string | null
  worldName: string | null
  sceneId: string | null
  groupId: string | null
  groupName: string | null
  groupColor: string | null
  tags: string[]
  positions: string[]
  createdAt: string
  updatedAt: string
}

// API now returns flattened place with ban status
type ApiPlaceWithBanStatus = ApiPlace & {
  isBanned: boolean
  banSceneId: string | null
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

function transformPlace(data: ApiPlace): Place {
  return {
    id: data.id,
    type: data.type,
    name: data.name,
    basePosition: data.basePosition,
    worldName: data.worldName,
    sceneId: data.sceneId,
    groupId: data.groupId,
    groupName: data.groupName,
    groupColor: data.groupColor,
    tags: data.tags || [],
    positions: data.positions || [],
    createdAt: new Date(data.createdAt).getTime(),
    updatedAt: new Date(data.updatedAt).getTime(),
  }
}

function transformPlaceWithBanStatus(data: ApiPlaceWithBanStatus): PlaceWithBanStatus {
  return {
    ...transformPlace(data),
    isBanned: data.isBanned,
    banSceneId: data.banSceneId,
  }
}

// ========== Public API (no auth required) ==========

export async function fetchAllPlaces(tags?: string[]): Promise<PlaceWithBanStatus[]> {
  const url = tags && tags.length > 0
    ? `${API_BASE}/places?tag=${tags.map(t => encodeURIComponent(t)).join(',')}`
    : `${API_BASE}/places`
  const response = await fetch(url)
  const json: ApiResponse<ApiPlaceWithBanStatus[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch places')
  }

  return (json.data || []).map(transformPlaceWithBanStatus)
}

// ========== Backoffice API (auth required) ==========

export async function fetchBackofficePlaces(authenticatedFetch: AuthenticatedFetch): Promise<Place[]> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/places`)
  const json: ApiResponse<ApiPlace[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch places')
  }

  return (json.data || []).map(transformPlace)
}

export async function createPlace(
  authenticatedFetch: AuthenticatedFetch,
  input: CreatePlaceInput
): Promise<Place> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiPlace> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to create place')
  }

  return transformPlace(json.data)
}

export async function updatePlace(
  authenticatedFetch: AuthenticatedFetch,
  id: string,
  input: UpdatePlaceInput
): Promise<Place> {
  const response = await authenticatedFetch(`${API_BASE}/backoffice/places/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json: ApiResponse<ApiPlace> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to update place')
  }

  return transformPlace(json.data)
}

// ========== Tags API ==========

interface ApiTag {
  id: string
  name: string
  description: string | null
  createdAt: string
}

function transformTag(data: ApiTag): Tag {
  return {
    id: data.id,
    name: data.name,
    description: data.description || undefined,
    createdAt: new Date(data.createdAt).getTime(),
  }
}

export async function fetchAllTags(): Promise<Tag[]> {
  const response = await fetch(`${API_BASE}/tags`)
  const json: ApiResponse<ApiTag[]> = await response.json()

  if (!json.ok) {
    throw new Error(json.error || 'Failed to fetch tags')
  }

  return (json.data || []).map(transformTag)
}
