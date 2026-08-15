import { unitDef } from '../simulation/GameState'
import { HUMAN, type EntityId, type GameState } from '../simulation/types'

/**
 * Selection is a view concern — it never enters GameState, so it cannot
 * desync a replay or a network peer.
 */
export class Selection {
  units = new Set<EntityId>()
  buildingId: EntityId | null = null
  readonly groups = new Map<number, EntityId[]>()

  get isEmpty(): boolean {
    return this.units.size === 0 && this.buildingId === null
  }

  clear(): void {
    this.units.clear()
    this.buildingId = null
  }

  setUnits(ids: Iterable<EntityId>): void {
    this.units = new Set(ids)
    this.buildingId = null
  }

  setBuilding(id: EntityId): void {
    this.units.clear()
    this.buildingId = id
  }

  ids(): EntityId[] {
    return [...this.units]
  }

  /** Drop entities that have died so the panel never shows ghosts. */
  prune(state: GameState): void {
    for (const id of this.units) if (!state.units.has(id)) this.units.delete(id)
    if (this.buildingId !== null && !state.buildings.has(this.buildingId)) this.buildingId = null
  }

  villagers(state: GameState): EntityId[] {
    return this.ids().filter((id) => {
      const unit = state.units.get(id)
      return unit && unitDef(unit.type).class === 'villager'
    })
  }

  military(state: GameState): EntityId[] {
    return this.ids().filter((id) => {
      const unit = state.units.get(id)
      return unit && unitDef(unit.type).class !== 'villager'
    })
  }

  assignGroup(slot: number): void {
    this.groups.set(slot, this.ids())
  }

  recallGroup(slot: number, state: GameState): boolean {
    const ids = (this.groups.get(slot) ?? []).filter((id) => state.units.has(id))
    if (ids.length === 0) return false
    this.setUnits(ids)
    return true
  }
}

export const idleVillagers = (state: GameState): EntityId[] => {
  const ids: EntityId[] = []
  for (const unit of state.units.values()) {
    if (unit.owner !== HUMAN || unitDef(unit.type).class !== 'villager') continue
    if (unit.order.kind === 'none' && unit.state === 'idle') ids.push(unit.id)
  }
  return ids
}

export const allMilitary = (state: GameState): EntityId[] => {
  const ids: EntityId[] = []
  for (const unit of state.units.values()) {
    if (unit.owner === HUMAN && unitDef(unit.type).class !== 'villager') ids.push(unit.id)
  }
  return ids
}
