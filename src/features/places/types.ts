export interface Tag {
  id: string
  name: string
  description?: string
  createdAt: number
}

export type PlaceType = 'scene' | 'world'

// A scene or world the BFF keeps curation tags for
export interface Place {
  id: string
  type: PlaceType
  name: string | null          // Scene/world title
  basePosition: string | null  // "x,y" format for scenes, null for worlds
  worldName: string | null     // For worlds
  sceneId: string | null
  groupId: string | null
  groupName: string | null
  groupColor: string | null
  tags: string[]
  positions: string[]          // ["x,y", "x,y"] format for scenes
  createdAt: number
  updatedAt: number
}

// Flattened place with ban status (as returned by the public /places API)
export type PlaceWithBanStatus = Place & {
  isBanned: boolean
  banSceneId: string | null
}
