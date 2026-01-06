import { config } from '../../../config'

const API_BASE = config.get('MOBILE_BFF_URL')

export interface WorldInfo {
  name: string
  title: string
  description: string | null
  thumbnail: string | null
  owner: string | null
  tags: string[]
  sceneId: string  // Current entity ID (for detecting redeploys)
  isBanned: boolean
  banId: string | null
  banReason: string | null
  banSceneId: string | null  // Scene ID at ban time (for detecting redeploys)
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * Fetch world info by name
 */
export async function fetchWorldInfo(worldName: string): Promise<WorldInfo> {
  const normalizedName = worldName.trim().toLowerCase()
  const response = await fetch(`${API_BASE}/worlds/${encodeURIComponent(normalizedName)}`)
  const json: ApiResponse<WorldInfo> = await response.json()

  if (!json.ok || !json.data) {
    throw new Error(json.error || 'Failed to fetch world info')
  }

  return json.data
}
