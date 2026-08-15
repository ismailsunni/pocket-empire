import { buildingCenter, buildingDef, unitDef } from './GameState'
import { FOG_EXPLORED, FOG_VISIBLE, HUMAN, type GameState } from './types'

export const FOG_INTERVAL = 5

const stamp = (state: GameState, cx: number, cy: number, radius: number): void => {
  const size = state.map.size
  const r2 = radius * radius
  const minX = Math.max(0, Math.floor(cx - radius))
  const maxX = Math.min(size - 1, Math.ceil(cx + radius))
  const minY = Math.max(0, Math.floor(cy - radius))
  const maxY = Math.min(size - 1, Math.ceil(cy + radius))
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const dx = tx + 0.5 - cx
      const dy = ty + 0.5 - cy
      if (dx * dx + dy * dy <= r2) state.fog[ty * size + tx] = FOG_VISIBLE
    }
  }
}

/**
 * Three states: unknown → explored → currently visible (§14). Only the human
 * player has a fog state; the MVP AI is allowed to cheat with full vision.
 */
export const updateFog = (state: GameState): void => {
  for (let i = 0; i < state.fog.length; i++) {
    if (state.fog[i] === FOG_VISIBLE) state.fog[i] = FOG_EXPLORED
  }
  for (const unit of state.units.values()) {
    if (unit.owner !== HUMAN) continue
    stamp(state, unit.x, unit.y, unitDef(unit.type).vision)
  }
  for (const building of state.buildings.values()) {
    if (building.owner !== HUMAN) continue
    const center = buildingCenter(building)
    stamp(state, center.x, center.y, buildingDef(building.type).vision)
  }
}

export const isVisible = (state: GameState, tx: number, ty: number): boolean =>
  state.fog[ty * state.map.size + tx] === FOG_VISIBLE
