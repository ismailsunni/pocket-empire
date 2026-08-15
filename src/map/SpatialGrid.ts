import type { EntityId, Unit } from '../simulation/types'

/**
 * Uniform bucket grid over unit positions. Rebuilt each tick; used for
 * separation steering and target acquisition so neither is O(n^2).
 */
export class SpatialGrid {
  private readonly cells: EntityId[][]
  private readonly cols: number

  constructor(
    private readonly size: number,
    private readonly cellSize = 4,
  ) {
    this.cols = Math.ceil(size / cellSize)
    this.cells = Array.from({ length: this.cols * this.cols }, () => [])
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0
  }

  rebuild(units: Map<EntityId, Unit>): void {
    this.clear()
    for (const unit of units.values()) this.cells[this.cellIndex(unit.x, unit.y)].push(unit.id)
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)))
    const cy = Math.min(this.cols - 1, Math.max(0, Math.floor(y / this.cellSize)))
    return cy * this.cols + cx
  }

  /** Ids within `radius` tiles of (x, y), in stable id order. */
  query(x: number, y: number, radius: number, out: EntityId[] = []): EntityId[] {
    out.length = 0
    const min = Math.max(0, Math.floor((x - radius) / this.cellSize))
    const max = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize))
    const minY = Math.max(0, Math.floor((y - radius) / this.cellSize))
    const maxY = Math.min(this.cols - 1, Math.floor((y + radius) / this.cellSize))
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = min; cx <= max; cx++) {
        for (const id of this.cells[cy * this.cols + cx]) out.push(id)
      }
    }
    out.sort((a, b) => a - b)
    return out
  }

  get tileSize(): number {
    return this.size
  }
}
