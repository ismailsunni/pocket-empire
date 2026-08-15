import type { MapData } from '../simulation/types'
import { NEIGHBORS, idx, isWalkable, nearestWalkable } from './Tile'

export const UNREACHABLE = 65535

const STRAIGHT = 10
const DIAGONAL = 14

export interface FlowField {
  goalX: number
  goalY: number
  cost: Uint16Array
  dirX: Int8Array
  dirY: Int8Array
}

/**
 * Dijkstra integration field from a single goal, shared by every unit heading
 * there (§19.3). Cost is per-destination, not per-unit — that is what makes
 * 100 units viable on a phone.
 */
export const computeFlowField = (map: MapData, goalX: number, goalY: number): FlowField => {
  const n = map.size * map.size
  const cost = new Uint16Array(n).fill(UNREACHABLE)
  const dirX = new Int8Array(n)
  const dirY = new Int8Array(n)

  const goal = nearestWalkable(map, goalX, goalY)
  if (!goal) return { goalX, goalY, cost, dirX, dirY }

  // Bucket queue: edge costs are 10 and 14, so a bounded ring of buckets
  // keeps this O(n) without a heap.
  const buckets: number[][] = Array.from({ length: DIAGONAL + 1 }, () => [])
  let current = 0
  let pending = 1
  cost[idx(map, goal[0], goal[1])] = 0
  buckets[0].push(idx(map, goal[0], goal[1]))

  while (pending > 0) {
    const bucket = buckets[current]
    while (bucket.length > 0) {
      const at = bucket.pop() as number
      pending--
      const c = cost[at]
      // Stale entry from a later relaxation.
      if (c % (DIAGONAL + 1) !== current) continue
      const tx = at % map.size
      const ty = (at / map.size) | 0
      for (let i = 0; i < NEIGHBORS.length; i++) {
        const [dx, dy] = NEIGHBORS[i]
        const nx = tx + dx
        const ny = ty + dy
        if (!isWalkable(map, nx, ny)) continue
        const diagonal = dx !== 0 && dy !== 0
        // No corner cutting: both orthogonal neighbours must be open.
        if (diagonal && (!isWalkable(map, tx + dx, ty) || !isWalkable(map, tx, ty + dy))) continue
        const step = diagonal ? DIAGONAL : STRAIGHT
        const next = c + step
        const ni = idx(map, nx, ny)
        if (next < cost[ni]) {
          cost[ni] = next
          buckets[next % (DIAGONAL + 1)].push(ni)
          pending++
        }
      }
    }
    current = (current + 1) % (DIAGONAL + 1)
  }

  // Post-pass: steepest descent toward the goal, computed once per field.
  for (let ty = 0; ty < map.size; ty++) {
    for (let tx = 0; tx < map.size; tx++) {
      const at = idx(map, tx, ty)
      if (cost[at] === UNREACHABLE || cost[at] === 0) continue
      let best = cost[at]
      let bx = 0
      let by = 0
      for (let i = 0; i < NEIGHBORS.length; i++) {
        const [dx, dy] = NEIGHBORS[i]
        const nx = tx + dx
        const ny = ty + dy
        if (!isWalkable(map, nx, ny)) continue
        if (dx !== 0 && dy !== 0 && (!isWalkable(map, tx + dx, ty) || !isWalkable(map, tx, ty + dy)))
          continue
        const c = cost[idx(map, nx, ny)]
        if (c < best) {
          best = c
          bx = dx
          by = dy
        }
      }
      dirX[at] = bx
      dirY[at] = by
    }
  }

  return { goalX: goal[0], goalY: goal[1], cost, dirX, dirY }
}
