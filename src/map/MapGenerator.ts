import { CONFIG, RESOURCE_DATA, type ResourceKind } from '../data'
import { createRng, nextFloat, nextInt, type Rng } from '../simulation/Random'
import type { MapData, ResourceNode } from '../simulation/types'
import { TERRAIN_GRASS, TERRAIN_WATER } from '../simulation/types'
import { idx, isWalkable, NEIGHBORS } from './Tile'

export interface GeneratedMap {
  map: MapData
  nodes: Map<number, ResourceNode>
  nextId: number
}

/** Value noise: a coarse random lattice, bilinearly interpolated. */
const noiseField = (rng: Rng, size: number, lattice: number): ((x: number, y: number) => number) => {
  const cols = Math.ceil(size / lattice) + 2
  const grid = new Float32Array(cols * cols)
  for (let i = 0; i < grid.length; i++) grid[i] = nextFloat(rng)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const gx = x / lattice
    const gy = y / lattice
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = smooth(gx - x0)
    const fy = smooth(gy - y0)
    const at = (cx: number, cy: number) => grid[Math.min(cols - 1, cy) * cols + Math.min(cols - 1, cx)]
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }
}

const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by)

/** BFS over walkable tiles: is `to` reachable from `from`? */
const connected = (map: MapData, from: [number, number], to: [number, number]): boolean => {
  const seen = new Uint8Array(map.size * map.size)
  const queue = [idx(map, from[0], from[1])]
  seen[queue[0]] = 1
  const goal = idx(map, to[0], to[1])
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    if (at === goal) return true
    const tx = at % map.size
    const ty = (at / map.size) | 0
    for (const [dx, dy] of NEIGHBORS) {
      const nx = tx + dx
      const ny = ty + dy
      if (!isWalkable(map, nx, ny)) continue
      const ni = idx(map, nx, ny)
      if (seen[ni]) continue
      seen[ni] = 1
      queue.push(ni)
    }
  }
  return false
}

const openTilesAround = (map: MapData, tx: number, ty: number, radius: number): number => {
  let open = 0
  for (let y = ty - radius; y <= ty + radius; y++) {
    for (let x = tx - radius; x <= tx + radius; x++) if (isWalkable(map, x, y)) open++
  }
  return open
}

class Builder {
  readonly size: number
  readonly half: number
  readonly terrain: Uint8Array
  readonly nodeAt: Int32Array
  readonly nodes = new Map<number, ResourceNode>()
  private id: number

  constructor(size: number, firstId: number) {
    this.size = size
    this.half = (size * size) / 2
    this.terrain = new Uint8Array(size * size).fill(TERRAIN_GRASS)
    this.nodeAt = new Int32Array(size * size).fill(-1)
    this.id = firstId
  }

  /** Only the first half is authored; the rest is its 180° rotation (§13). */
  inFirstHalf(tx: number, ty: number): boolean {
    const i = ty * this.size + tx
    return i >= 0 && i < this.half
  }

  addNode(kind: ResourceKind, tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return
    if (!this.inFirstHalf(tx, ty)) return
    const i = ty * this.size + tx
    if (this.nodeAt[i] !== -1 || this.terrain[i] === TERRAIN_WATER) return
    const node: ResourceNode = { id: this.id++, kind, tx, ty, amount: RESOURCE_DATA.nodeAmounts[kind] }
    this.nodes.set(node.id, node)
    this.nodeAt[i] = node.id
  }

  clearArea(tx: number, ty: number, radius: number): void {
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue
        if (dist(x, y, tx, ty) > radius) continue
        const i = y * this.size + x
        this.terrain[i] = TERRAIN_GRASS
        const nodeId = this.nodeAt[i]
        if (nodeId !== -1) {
          this.nodes.delete(nodeId)
          this.nodeAt[i] = -1
        }
      }
    }
  }

  /** Blob of resource tiles around a centre. */
  cluster(rng: Rng, kind: ResourceKind, cx: number, cy: number, count: number, spread: number): void {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < count * 12) {
      attempts++
      const angle = nextFloat(rng) * Math.PI * 2
      const r = nextFloat(rng) * spread
      const tx = Math.round(cx + Math.cos(angle) * r)
      const ty = Math.round(cy + Math.sin(angle) * r)
      const i = ty * this.size + tx
      if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) continue
      if (this.nodeAt[i] !== -1) continue
      this.addNode(kind, tx, ty)
      if (this.nodeAt[i] !== -1) placed++
    }
  }

  finish(starts: { tx: number; ty: number }[]): GeneratedMap {
    const n = this.size * this.size
    // Mirror the authored half onto the other half.
    for (let i = 0; i < this.half; i++) {
      const j = n - 1 - i
      this.terrain[j] = this.terrain[i]
      const nodeId = this.nodeAt[i]
      if (nodeId !== -1) {
        const source = this.nodes.get(nodeId) as ResourceNode
        const mirrored: ResourceNode = {
          id: this.id++,
          kind: source.kind,
          tx: this.size - 1 - source.tx,
          ty: this.size - 1 - source.ty,
          amount: source.amount,
        }
        this.nodes.set(mirrored.id, mirrored)
        this.nodeAt[j] = mirrored.id
      } else {
        this.nodeAt[j] = -1
      }
    }

    const blocked = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      blocked[i] = this.terrain[i] === TERRAIN_WATER || this.nodeAt[i] !== -1 ? 1 : 0
    }

    const map: MapData = { size: this.size, terrain: this.terrain, blocked, nodeAt: this.nodeAt, starts }
    return { map, nodes: this.nodes, nextId: this.id }
  }
}

const attempt = (seed: number, size: number, firstId: number): GeneratedMap => {
  const rng = createRng(seed)
  const b = new Builder(size, firstId)
  const water = noiseField(rng, size, 14)
  const woods = noiseField(rng, size, 9)

  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      if (!b.inFirstHalf(tx, ty)) continue
      const i = ty * size + tx
      if (water(tx, ty) < 0.24) b.terrain[i] = TERRAIN_WATER
      else if (woods(tx, ty) > 0.68) b.addNode('wood', tx, ty)
    }
  }

  const start = { tx: Math.round(size * 0.2), ty: Math.round(size * 0.25) }
  const mirrored = { tx: size - 1 - start.tx, ty: size - 1 - start.ty }

  // Guaranteed opening: clear ground, then a legible starting economy.
  b.clearArea(start.tx, start.ty, CONFIG.map.startClearance)
  b.cluster(rng, 'food', start.tx + 5, start.ty - 4, 7, 2.2)
  b.cluster(rng, 'wood', start.tx - 7, start.ty + 5, 26, 4)
  b.cluster(rng, 'gold', start.tx + 9, start.ty + 6, 5, 1.6)
  b.cluster(rng, 'stone', start.tx - 4, start.ty - 9, 4, 1.4)

  // Contested middle (§13): one cluster near centre, mirrored into a pair.
  const cx = Math.round(size / 2) - 6 + nextInt(rng, 5)
  const cy = Math.round(size / 2) - 10 + nextInt(rng, 5)
  b.clearArea(cx, cy, 5)
  b.cluster(rng, 'gold', cx, cy, 6, 2)
  b.cluster(rng, 'food', cx + 6, cy + 3, 6, 2)

  return b.finish([start, mirrored])
}

const valid = (generated: GeneratedMap): boolean => {
  const { map } = generated
  const [a, b] = map.starts
  if (!isWalkable(map, a.tx, a.ty)) return false
  if (openTilesAround(map, a.tx, a.ty, 4) < 50) return false
  return connected(map, [a.tx, a.ty], [b.tx, b.ty])
}

/**
 * Generates a map from a seed, re-rolling until the §13 guarantees hold.
 * Fairness is structural: the map is its own 180° rotation.
 */
export const generateMap = (seed: number, firstId = 1): GeneratedMap => {
  const size = CONFIG.map.size
  for (let i = 0; i < CONFIG.map.maxGenerationAttempts; i++) {
    const generated = attempt(seed + i * 7919, size, firstId)
    if (valid(generated)) return generated
  }
  // Last resort: a map with no water at all satisfies every guarantee.
  const rng = createRng(seed)
  const b = new Builder(size, firstId)
  const start = { tx: Math.round(size * 0.2), ty: Math.round(size * 0.25) }
  b.cluster(rng, 'wood', start.tx - 7, start.ty + 5, 26, 4)
  b.cluster(rng, 'food', start.tx + 5, start.ty - 4, 7, 2.2)
  b.cluster(rng, 'gold', start.tx + 9, start.ty + 6, 5, 1.6)
  b.cluster(rng, 'stone', start.tx - 4, start.ty - 9, 4, 1.4)
  return b.finish([start, { tx: size - 1 - start.tx, ty: size - 1 - start.ty }])
}
