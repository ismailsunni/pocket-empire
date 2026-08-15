import { CONFIG } from '../data'
import type { PathService } from '../map/Pathfinding'
import type { SpatialGrid } from '../map/SpatialGrid'
import { idx, isWalkable } from '../map/Tile'
import { unitDef } from './GameState'
import type { EntityId, GameState, Unit } from './types'

export const ARRIVE_RADIUS = 0.55
const SEPARATION_WEIGHT = 0.9
const STUCK_TICKS = 40

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by)

export const arrived = (unit: Unit): boolean =>
  distance(unit.x, unit.y, unit.destX, unit.destY) <= ARRIVE_RADIUS

export const setDestination = (unit: Unit, tx: number, ty: number): void => {
  unit.destX = tx
  unit.destY = ty
  unit.stuck = 0
  unit.state = 'moving'
}

/**
 * Units follow the shared flow field and apply short-range separation from
 * neighbours (§19.3). No per-unit long-range replanning, ever.
 */
export const updateMovement = (
  state: GameState,
  path: PathService,
  grid: SpatialGrid,
  dt: number,
): void => {
  const neighbours: EntityId[] = []
  for (const unit of state.units.values()) {
    unit.px = unit.x
    unit.py = unit.y
    if (unit.state !== 'moving' && unit.state !== 'returning' && unit.state !== 'fleeing') continue

    if (arrived(unit)) {
      unit.stuck = 0
      unit.state = 'idle'
      continue
    }

    const speed = unitDef(unit.type).speed
    let dx = unit.destX - unit.x
    let dy = unit.destY - unit.y

    const field = path.request(Math.floor(unit.destX), Math.floor(unit.destY))
    if (field) {
      const tile = idx(state.map, Math.floor(unit.x), Math.floor(unit.y))
      const fx = field.dirX[tile]
      const fy = field.dirY[tile]
      if (fx !== 0 || fy !== 0) {
        dx = fx
        dy = fy
      }
    }

    let length = Math.hypot(dx, dy)
    if (length < 1e-6) {
      unit.state = 'idle'
      continue
    }
    dx /= length
    dy /= length

    // Local steering: push away from close neighbours.
    let sx = 0
    let sy = 0
    grid.query(unit.x, unit.y, CONFIG.separationRadius * 2, neighbours)
    for (const otherId of neighbours) {
      if (otherId === unit.id) continue
      const other = state.units.get(otherId)
      if (!other) continue
      const ox = unit.x - other.x
      const oy = unit.y - other.y
      const d = Math.hypot(ox, oy)
      if (d > 1e-4 && d < CONFIG.separationRadius) {
        const push = (CONFIG.separationRadius - d) / CONFIG.separationRadius
        sx += (ox / d) * push
        sy += (oy / d) * push
      }
    }

    dx += sx * SEPARATION_WEIGHT
    dy += sy * SEPARATION_WEIGHT
    length = Math.hypot(dx, dy)
    if (length < 1e-6) continue
    dx /= length
    dy /= length

    const step = speed * dt
    const nx = unit.x + dx * step
    const ny = unit.y + dy * step

    // Slide along blockers rather than stopping dead against them.
    const okX = isWalkable(state.map, Math.floor(nx), Math.floor(unit.y))
    const okY = isWalkable(state.map, Math.floor(unit.x), Math.floor(ny))
    const before = unit.x + unit.y
    if (okX) unit.x = nx
    if (okY) unit.y = ny

    if (Math.abs(unit.x + unit.y - before) < step * 0.15) {
      unit.stuck++
      // Unreachable destination: stop as close as possible (§19.3).
      if (unit.stuck > STUCK_TICKS) {
        unit.state = 'idle'
        unit.order = { kind: 'none' }
        unit.stuck = 0
      }
    } else {
      unit.stuck = 0
    }
  }
}

/** Buildings displace units standing on their footprint rather than blocking placement (§9.1). */
export const pushUnitsOutOfFootprint = (
  state: GameState,
  tx: number,
  ty: number,
  size: number,
): void => {
  for (const unit of state.units.values()) {
    if (unit.x < tx || unit.y < ty || unit.x >= tx + size || unit.y >= ty + size) continue
    const cx = tx + size / 2
    const cy = ty + size / 2
    let dx = unit.x - cx
    let dy = unit.y - cy
    if (Math.hypot(dx, dy) < 1e-4) {
      dx = 1
      dy = 0
    }
    const length = Math.hypot(dx, dy)
    for (let push = size / 2 + 0.6; push < size + 6; push += 0.6) {
      const nx = cx + (dx / length) * push
      const ny = cy + (dy / length) * push
      if (isWalkable(state.map, Math.floor(nx), Math.floor(ny))) {
        unit.x = nx
        unit.y = ny
        unit.px = nx
        unit.py = ny
        break
      }
    }
  }
}
