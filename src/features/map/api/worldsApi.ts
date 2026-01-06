const ASSET_BUNDLE_REGISTRY = 'https://asset-bundle-registry.decentraland.org'
const WORLDS_CONTENT_SERVER = 'https://worlds-content-server.decentraland.org'

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

interface WorldEntity {
  id: string
  type: string
  pointers: string[]
  timestamp: number
  content: Array<{ file: string; hash: string }>
  metadata?: {
    display?: {
      title?: string
      description?: string
      navmapThumbnail?: string
    }
    owner?: string
    tags?: string[]
    worldConfiguration?: {
      name?: string
    }
  }
}

/**
 * Fetch world info from asset-bundle-registry
 */
export async function fetchWorldInfo(worldName: string): Promise<WorldInfo> {
  let normalizedName = worldName.trim().toLowerCase()

  // Append .dcl.eth if not already present
  if (!normalizedName.endsWith('.dcl.eth') && !normalizedName.endsWith('.eth')) {
    normalizedName = `${normalizedName}.dcl.eth`
  }

  const response = await fetch(`${ASSET_BUNDLE_REGISTRY}/entities/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pointers: [normalizedName] })
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch world info: ${response.status}`)
  }

  const entities: WorldEntity[] = await response.json()
  const entity = entities[0]

  if (!entity) {
    throw new Error(`World "${normalizedName}" not found`)
  }

  const metadata = entity.metadata
  const title = metadata?.display?.title || metadata?.worldConfiguration?.name || normalizedName
  const description = metadata?.display?.description || null
  const owner = metadata?.owner || null
  const tags = metadata?.tags || []

  // Build thumbnail URL if available
  let thumbnail: string | null = null
  if (metadata?.display?.navmapThumbnail) {
    const thumbnailHash = entity.content?.find(
      c => c.file === metadata.display?.navmapThumbnail
    )?.hash
    if (thumbnailHash) {
      thumbnail = `${WORLDS_CONTENT_SERVER}/contents/${thumbnailHash}`
    }
  }

  return {
    name: normalizedName,
    title,
    description,
    thumbnail,
    owner,
    tags,
    sceneId: entity.id,
    isBanned: false, // Will be updated by caller with local ban state
    banId: null,
    banReason: null,
    banSceneId: null
  }
}
