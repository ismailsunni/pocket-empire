import type { EntityId, PlayerId } from './types'

/**
 * All intent — player input, AI decisions, and later network messages — becomes
 * one of these and is applied at a tick boundary (§19.2 Rule 4).
 */
export type Command =
  | { kind: 'move'; player: PlayerId; units: EntityId[]; tx: number; ty: number }
  | { kind: 'attackMove'; player: PlayerId; units: EntityId[]; tx: number; ty: number }
  | { kind: 'attack'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'gather'; player: PlayerId; units: EntityId[]; nodeId: EntityId }
  | { kind: 'stop'; player: PlayerId; units: EntityId[] }
  | { kind: 'place'; player: PlayerId; units: EntityId[]; building: string; tx: number; ty: number }
  | { kind: 'assist'; player: PlayerId; units: EntityId[]; buildingId: EntityId }
  | { kind: 'train'; player: PlayerId; buildingId: EntityId; unit: string }
  | { kind: 'research'; player: PlayerId; buildingId: EntityId; tech: string }
  | { kind: 'advanceAge'; player: PlayerId; buildingId: EntityId }
  | { kind: 'cancelQueue'; player: PlayerId; buildingId: EntityId; index: number }
  | { kind: 'demolish'; player: PlayerId; buildingId: EntityId }
  | { kind: 'setRally'; player: PlayerId; buildingId: EntityId; tx: number; ty: number }
  | { kind: 'surrender'; player: PlayerId }
