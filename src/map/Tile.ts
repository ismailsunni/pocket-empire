import type { MapData } from '../simulation/types'
import { TERRAIN_WATER } from '../simulation/types'

export const idx = (map: MapData, tx: number, ty: number): number => ty * map.size + tx

export const inBounds = (map: MapData, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < map.size && ty < map.size

export const isWalkable = (map: MapData, tx: number, ty: number): boolean =>
  inBounds(map, tx, ty) && map.blocked[idx(map, tx, ty)] === 0

export const isWater = (map: MapData, tx: number, ty: number): boolean =>
  inBounds(map, tx, ty) && map.terrain[idx(map, tx, ty)] === TERRAIN_WATER

export const nodeIdAt = (map: MapData, tx: number, ty: number): number =>
  inBounds(map, tx, ty) ? map.nodeAt[idx(map, tx, ty)] : -1

/** 8-neighbour offsets, fixed order so iteration never affects determinism. */
export const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/** Nearest walkable tile to (tx, ty) by expanding ring search. */
export const nearestWalkable = (map: MapData, tx: number, ty: number, maxRadius = 16): [number, number] | null => {
  if (isWalkable(map, tx, ty)) return [tx, ty]
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = tx + dx
        const ny = ty + dy
        if (isWalkable(map, nx, ny)) return [nx, ny]
      }
    }
  }
  return null
}
