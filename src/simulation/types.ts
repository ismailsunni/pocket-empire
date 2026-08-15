import type { Cost, ResourceKind } from '../data'
import type { Rng } from './Random'

export type EntityId = number
export type PlayerId = number

export const TERRAIN_GRASS = 0
export const TERRAIN_WATER = 1

export const FOG_UNKNOWN = 0
export const FOG_EXPLORED = 1
export const FOG_VISIBLE = 2

export interface ResourceNode {
  id: EntityId
  kind: ResourceKind
  tx: number
  ty: number
  amount: number
  /** farms never deplete — the renewable exception in §7.1 */
  renewable?: boolean
  /** set when the node is the yield of a farm building */
  buildingId?: EntityId
}

export interface MapData {
  size: number
  /** TERRAIN_* per tile, row-major */
  terrain: Uint8Array
  /** 1 = impassable (water, resource node, or building footprint) */
  blocked: Uint8Array
  /** tile -> resource node id, or -1 */
  nodeAt: Int32Array
  starts: { tx: number; ty: number }[]
}

export type UnitState =
  | 'idle'
  | 'moving'
  | 'gathering'
  | 'returning'
  | 'building'
  | 'attacking'
  | 'fleeing'

export type Order =
  | { kind: 'none' }
  | { kind: 'move'; tx: number; ty: number }
  | { kind: 'gather'; nodeId: EntityId }
  | { kind: 'build'; buildingId: EntityId }
  | { kind: 'attack'; targetId: EntityId }
  | { kind: 'attackMove'; tx: number; ty: number }

export interface Unit {
  id: EntityId
  owner: PlayerId
  type: string
  x: number
  y: number
  /** previous tick position, for render interpolation */
  px: number
  py: number
  hp: number
  state: UnitState
  order: Order
  /** current pathing destination in tiles */
  destX: number
  destY: number
  carryKind: ResourceKind | null
  carryAmount: number
  /** node the villager was last assigned to, for auto-retask after drop-off */
  lastNodeId: EntityId
  cooldown: number
  /** current combat target (unit or building), -1 when none */
  targetId: EntityId
  /** ticks with negligible movement, used to abandon impossible paths */
  stuck: number
  gatherProgress: number
}

export interface ProductionItem {
  kind: 'unit' | 'tech' | 'age'
  id: string
  remaining: number
  total: number
}

export interface Building {
  id: EntityId
  owner: PlayerId
  type: string
  tx: number
  ty: number
  size: number
  hp: number
  maxHp: number
  complete: boolean
  /** accumulated build ticks against def.buildTime * tickRate */
  buildProgress: number
  buildersThisTick: number
  spent: Cost
  queue: ProductionItem[]
  rallyX: number
  rallyY: number
  cooldown: number
  /** remaining food for farms */
  farmFood: number
}

export interface Player {
  id: PlayerId
  isAI: boolean
  resources: Record<ResourceKind, number>
  popUsed: number
  popCap: number
  ageIndex: number
  techs: string[]
  defeated: boolean
}

export type GameEvent =
  | { kind: 'popCapped' }
  | { kind: 'insufficientResources' }
  | { kind: 'ageAdvanced'; player: PlayerId; age: string }
  | { kind: 'underAttack'; player: PlayerId; x: number; y: number }
  | { kind: 'buildingComplete'; player: PlayerId; type: string }
  | { kind: 'unitTrained'; player: PlayerId; type: string }
  | { kind: 'gameOver'; winner: PlayerId }

export type GameStatus = 'playing' | 'over'

export interface GameState {
  seed: number
  tick: number
  rng: Rng
  map: MapData
  players: Player[]
  units: Map<EntityId, Unit>
  buildings: Map<EntityId, Building>
  nodes: Map<EntityId, ResourceNode>
  /** fog state for the human player only; the MVP AI cheats (§14) */
  fog: Uint8Array
  nextId: EntityId
  status: GameStatus
  winner: PlayerId
  events: GameEvent[]
  ai: AIMemory
  /** set when the blocked grid changed; the path service drops cached fields */
  mapDirty: boolean
}

export interface AIMemory {
  phase: number
  lastAttackTick: number
  attacking: boolean
  pendingBuild: string | null
}

export const HUMAN: PlayerId = 0
export const ENEMY: PlayerId = 1
