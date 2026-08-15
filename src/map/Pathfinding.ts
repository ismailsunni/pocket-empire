import { CONFIG } from '../data'
import type { MapData } from '../simulation/types'
import { computeFlowField, UNREACHABLE, type FlowField } from './FlowField'

const MAX_CACHED_FIELDS = 24

/**
 * Flow-field cache with a per-tick compute budget (§19.3). Requests beyond the
 * budget queue rather than spiking frame time; units without a field yet steer
 * straight at their destination for those few ticks.
 */
export class PathService {
  private fields = new Map<number, FlowField>()
  private queue: number[] = []
  private map: MapData

  constructor(map: MapData) {
    this.map = map
  }

  setMap(map: MapData): void {
    this.map = map
    this.invalidate()
  }

  /** Terrain or buildings changed: every cached field is now wrong. */
  invalidate(): void {
    this.fields.clear()
    this.queue.length = 0
  }

  private key(tx: number, ty: number): number {
    return ty * this.map.size + tx
  }

  /** Field for a destination, or null while the request is still queued. */
  request(tx: number, ty: number): FlowField | null {
    const key = this.key(tx, ty)
    const existing = this.fields.get(key)
    if (existing) {
      // Refresh LRU position.
      this.fields.delete(key)
      this.fields.set(key, existing)
      return existing
    }
    if (!this.queue.includes(key)) this.queue.push(key)
    return null
  }

  /** Spend this tick's path budget. Called once per simulation tick. */
  update(): void {
    let budget = CONFIG.pathBudgetPerTick
    while (budget > 0 && this.queue.length > 0) {
      const key = this.queue.shift() as number
      if (this.fields.has(key)) continue
      const tx = key % this.map.size
      const ty = (key / this.map.size) | 0
      this.fields.set(key, computeFlowField(this.map, tx, ty))
      if (this.fields.size > MAX_CACHED_FIELDS) {
        const oldest = this.fields.keys().next().value as number
        this.fields.delete(oldest)
      }
      budget--
    }
  }

  reachable(field: FlowField, tx: number, ty: number): boolean {
    return field.cost[ty * this.map.size + tx] !== UNREACHABLE
  }
}
