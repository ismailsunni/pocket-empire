import { buildingCenter } from '../simulation/GameState'
import { distance } from '../simulation/Movement'
import { FOG_UNKNOWN, FOG_VISIBLE, HUMAN, type Building, type GameState, type ResourceNode, type Unit } from '../simulation/types'

/** Hit areas are inflated beyond the sprite so small units stay tappable (§16.1). */
export const pickUnit = (
  state: GameState,
  x: number,
  y: number,
  radius: number,
  owner?: number,
): Unit | null => {
  let best: Unit | null = null
  let bestDistance = radius
  for (const unit of state.units.values()) {
    if (owner !== undefined && unit.owner !== owner) continue
    if (unit.owner !== HUMAN) {
      const i = Math.floor(unit.y) * state.map.size + Math.floor(unit.x)
      if (state.fog[i] !== FOG_VISIBLE) continue
    }
    const d = distance(x, y, unit.x, unit.y)
    if (d < bestDistance) {
      bestDistance = d
      best = unit
    }
  }
  return best
}

export const pickBuilding = (state: GameState, x: number, y: number): Building | null => {
  for (const building of state.buildings.values()) {
    if (x < building.tx || y < building.ty) continue
    if (x >= building.tx + building.size || y >= building.ty + building.size) continue
    if (building.owner !== HUMAN) {
      const center = buildingCenter(building)
      const i = Math.floor(center.y) * state.map.size + Math.floor(center.x)
      if (state.fog[i] === FOG_UNKNOWN) continue
    }
    return building
  }
  return null
}

export const pickNode = (state: GameState, x: number, y: number): ResourceNode | null => {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= state.map.size || ty >= state.map.size) return null
  const id = state.map.nodeAt[ty * state.map.size + tx]
  if (id === -1) return null
  if (state.fog[ty * state.map.size + tx] === FOG_UNKNOWN) return null
  return state.nodes.get(id) ?? null
}

/** The food node belonging to a farm, so tapping a farm assigns a worker. */
export const farmNodeOf = (state: GameState, building: Building): ResourceNode | null => {
  for (const node of state.nodes.values()) if (node.buildingId === building.id) return node
  return null
}

export const unitsInRect = (
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  owner: number,
): Unit[] => {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const found: Unit[] = []
  for (const unit of state.units.values()) {
    if (unit.owner !== owner) continue
    if (unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY) found.push(unit)
  }
  return found
}
