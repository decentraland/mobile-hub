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

interface WorldAboutResponse {
  configurations?: {
    scenesUrn?: string[]
  }
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
 * Fetch world info from worlds-content-server via /about endpoint
 */
export async function fetchWorldInfo(worldName: string): Promise<WorldInfo> {
  let normalizedName = worldName.trim().toLowerCase()

  if (!normalizedName.endsWith('.dcl.eth') && !normalizedName.endsWith('.eth')) {
    normalizedName = `${normalizedName}.dcl.eth`
  }

  const aboutResponse = await fetch(
    `${WORLDS_CONTENT_SERVER}/world/${normalizedName}/about`
  )

  if (!aboutResponse.ok) {
    throw new Error(`World "${normalizedName}" not found`)
  }

  const aboutData: WorldAboutResponse = await aboutResponse.json()
  const scenesUrn = aboutData.configurations?.scenesUrn

  if (!scenesUrn || scenesUrn.length === 0) {
    throw new Error(`World "${normalizedName}" not found`)
  }

  const urn = scenesUrn[0]
  const hashMatch = urn.match(/urn:decentraland:entity:([^?]+)/)
  if (!hashMatch) {
    throw new Error(`Invalid scene URN format for "${normalizedName}"`)
  }
  const entityHash = hashMatch[1]

  const entityResponse = await fetch(
    `${WORLDS_CONTENT_SERVER}/contents/${entityHash}`
  )

  if (!entityResponse.ok) {
    throw new Error(`Failed to fetch entity for "${normalizedName}": ${entityResponse.status}`)
  }

  const entity: WorldEntity = await entityResponse.json()

  const metadata = entity.metadata
  const title = metadata?.display?.title || metadata?.worldConfiguration?.name || normalizedName
  const description = metadata?.display?.description || null
  const owner = metadata?.owner || null
  const tags = metadata?.tags || []

  const thumbnailFile = metadata?.display?.navmapThumbnail
  const thumbnailHash = thumbnailFile
    ? entity.content?.find(c => c.file === thumbnailFile)?.hash
    : undefined
  const thumbnail = thumbnailHash
    ? `${WORLDS_CONTENT_SERVER}/contents/${thumbnailHash}`
    : null

  return {
    name: normalizedName,
    title,
    description,
    thumbnail,
    owner,
    tags,
    sceneId: entityHash,
    isBanned: false, // Will be updated by caller with local ban state
    banId: null,
    banReason: null,
    banSceneId: null
  }
}
