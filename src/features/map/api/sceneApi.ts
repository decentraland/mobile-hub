import type { ParcelCoord } from '../types'

const CATALYST_URL = 'https://peer.decentraland.org/content'

export interface SceneMetadata {
  display?: {
    title?: string
    description?: string
    navmapThumbnail?: string
    favicon?: string
  }
  contact?: {
    name?: string
    email?: string
  }
  owner?: string
  scene?: {
    parcels: string[]
    base: string
  }
  main?: string
  tags?: string[]
}

export interface SceneEntity {
  id: string
  type: string
  pointers: string[]
  timestamp: number
  content: Array<{ file: string; hash: string }>
  metadata: SceneMetadata
}

export interface SceneInfo {
  entityId: string
  name: string
  description: string
  thumbnail: string | null
  owner: string | null
  parcels: ParcelCoord[]
  baseParcel: ParcelCoord | null
  deployedAt: Date
  tags: string[]
}

/**
 * Fetch scene info from the Catalyst for a specific parcel
 */
export async function fetchSceneByParcel(parcel: ParcelCoord): Promise<SceneInfo | null> {
  const pointer = `${parcel.x},${parcel.y}`

  try {
    const response = await fetch(`${CATALYST_URL}/entities/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointers: [pointer] })
    })

    if (!response.ok) {
      console.error('Failed to fetch scene:', response.statusText)
      return null
    }

    const entities: SceneEntity[] = await response.json()

    if (entities.length === 0) {
      return null
    }

    const entity = entities[0]
    return parseSceneEntity(entity)
  } catch (error) {
    console.error('Error fetching scene:', error)
    return null
  }
}

/**
 * Fetch scene info for multiple parcels at once
 */
export async function fetchScenesByParcels(parcels: ParcelCoord[]): Promise<Map<string, SceneInfo>> {
  const pointers = parcels.map(p => `${p.x},${p.y}`)
  const result = new Map<string, SceneInfo>()

  if (pointers.length === 0) return result

  try {
    const response = await fetch(`${CATALYST_URL}/entities/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointers })
    })

    if (!response.ok) {
      console.error('Failed to fetch scenes:', response.statusText)
      return result
    }

    const entities: SceneEntity[] = await response.json()

    for (const entity of entities) {
      const sceneInfo = parseSceneEntity(entity)
      // Map all pointers of this scene to the same info
      for (const pointer of entity.pointers) {
        result.set(pointer, sceneInfo)
      }
    }

    return result
  } catch (error) {
    console.error('Error fetching scenes:', error)
    return result
  }
}

function parseSceneEntity(entity: SceneEntity): SceneInfo {
  const metadata = entity.metadata || {}
  const display = metadata.display || {}
  const scene = metadata.scene

  // Parse base parcel
  let baseParcel: ParcelCoord | null = null
  if (scene?.base) {
    const [x, y] = scene.base.split(',').map(Number)
    if (!isNaN(x) && !isNaN(y)) {
      baseParcel = { x, y }
    }
  }

  // Parse all parcels
  const parcelStrings = scene?.parcels || entity.pointers
  const parcels: ParcelCoord[] = parcelStrings.map((p: string) => {
    const [x, y] = p.split(',').map(Number)
    return { x, y }
  }).filter((p: ParcelCoord) => !isNaN(p.x) && !isNaN(p.y))

  // Get thumbnail URL
  let thumbnail: string | null = null
  if (display.navmapThumbnail) {
    // Find the content hash for the thumbnail
    const thumbnailContent = entity.content.find(c => c.file === display.navmapThumbnail)
    if (thumbnailContent) {
      thumbnail = `${CATALYST_URL}/contents/${thumbnailContent.hash}`
    }
  }

  return {
    entityId: entity.id,
    name: display.title || 'Unnamed Scene',
    description: display.description || '',
    thumbnail,
    owner: metadata.owner || metadata.contact?.name || null,
    parcels,
    baseParcel,
    deployedAt: new Date(entity.timestamp),
    tags: metadata.tags || []
  }
}

/**
 * Get a readable parcel range string (e.g., "10,20 to 12,22")
 */
export function getParcelRangeString(parcels: ParcelCoord[]): string {
  if (parcels.length === 0) return ''
  if (parcels.length === 1) return `${parcels[0].x},${parcels[0].y}`

  const minX = Math.min(...parcels.map(p => p.x))
  const maxX = Math.max(...parcels.map(p => p.x))
  const minY = Math.min(...parcels.map(p => p.y))
  const maxY = Math.max(...parcels.map(p => p.y))

  if (minX === maxX && minY === maxY) {
    return `${minX},${minY}`
  }

  return `${minX},${minY} to ${maxX},${maxY}`
}

/**
 * Get a readable position range string from position strings (e.g., "10,20 to 12,22")
 */
export function getPositionRangeString(positions: string[]): string {
  if (positions.length === 0) return ''
  if (positions.length === 1) return positions[0]

  const coords = positions.map(pos => {
    const [x, y] = pos.split(',').map(Number)
    return { x, y }
  })

  const minX = Math.min(...coords.map(p => p.x))
  const maxX = Math.max(...coords.map(p => p.x))
  const minY = Math.min(...coords.map(p => p.y))
  const maxY = Math.max(...coords.map(p => p.y))

  if (minX === maxX && minY === maxY) {
    return `${minX},${minY}`
  }

  return `${minX},${minY} to ${maxX},${maxY}`
}
