import type { ResourceKind } from '../data'

/** Placeholder art only (§22 Phase 1): flat shapes, top-down orthogonal. */
export const TILE = 32

export const COLORS = {
  grass: [0x3d6b32, 0x426f36, 0x38632e],
  water: 0x2b5d78,
  fogUnknown: 0x05080a,
  fogExplored: 0x05080a,
  ghostValid: 0x7fd07f,
  ghostInvalid: 0xd0605a,
  selection: 0xf2e6b0,
  hpGood: 0x6fd06f,
  hpBad: 0xd0605a,
}

export const PLAYER_COLORS = [0x4aa3ff, 0xe4574a]

export const NODE_COLORS: Record<ResourceKind, number> = {
  wood: 0x2f5d2a,
  food: 0xc0392b,
  gold: 0xd4af37,
  stone: 0x9aa0a6,
}

export const RESOURCE_ICONS: Record<ResourceKind, string> = {
  food: '🍖',
  wood: '🪵',
  gold: '🟡',
  stone: '🪨',
}

export const worldToScreen = (tile: number): number => tile * TILE
