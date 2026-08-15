import { buildingDef, unitDef } from '../simulation/GameState'
import type { Game } from '../simulation/Game'
import { HUMAN, type EntityId, type GameState } from '../simulation/types'
import { farmNodeOf, pickBuilding, pickNode, pickUnit } from './Picking'
import type { Selection } from './Selection'

export type ContextResult = 'move' | 'attack' | 'gather' | 'build' | 'select' | 'none'

/**
 * Contextual command resolution (§8): the game infers intent from what was
 * tapped. Both input adapters funnel through here, so touch and desktop emit
 * exactly the same commands into the same queue.
 */
export class CommandEmitter {
  constructor(
    private readonly game: Game,
    private readonly selection: Selection,
  ) {}

  private get state(): GameState {
    return this.game.state
  }

  /** Tap/right-click on the world with something selected. */
  context(x: number, y: number, pickRadius: number): ContextResult {
    const ids = this.selection.ids()
    if (ids.length === 0) return 'none'

    const enemy = pickUnit(this.state, x, y, pickRadius)
    if (enemy && enemy.owner !== HUMAN) {
      this.attack(ids, enemy.id)
      return 'attack'
    }

    const building = pickBuilding(this.state, x, y)
    if (building && building.owner !== HUMAN) {
      this.attack(ids, building.id)
      return 'attack'
    }

    const villagers = this.selection.villagers(this.state)
    if (villagers.length > 0) {
      if (building && building.owner === HUMAN) {
        if (!building.complete) {
          this.game.queue.push({ kind: 'assist', player: HUMAN, units: villagers, buildingId: building.id })
          return 'build'
        }
        const farm = buildingDef(building.type).farmFood ? farmNodeOf(this.state, building) : null
        if (farm) {
          this.game.queue.push({ kind: 'gather', player: HUMAN, units: villagers, nodeId: farm.id })
          return 'gather'
        }
      }
      const node = pickNode(this.state, x, y)
      if (node) {
        this.game.queue.push({ kind: 'gather', player: HUMAN, units: villagers, nodeId: node.id })
        const others = ids.filter((id) => !villagers.includes(id))
        if (others.length > 0) this.move(others, x, y)
        return 'gather'
      }
    }

    this.move(ids, x, y)
    return 'move'
  }

  move(units: EntityId[], x: number, y: number): void {
    if (units.length === 0) return
    this.game.queue.push({ kind: 'move', player: HUMAN, units, tx: x, ty: y })
  }

  attackMove(units: EntityId[], x: number, y: number): void {
    if (units.length === 0) return
    this.game.queue.push({ kind: 'attackMove', player: HUMAN, units, tx: x, ty: y })
  }

  attack(units: EntityId[], targetId: EntityId): void {
    const military = this.selection.military(this.state)
    const attackers = military.length > 0 ? military : units
    this.game.queue.push({ kind: 'attack', player: HUMAN, units: attackers, targetId })
  }

  stop(): void {
    const ids = this.selection.ids()
    if (ids.length > 0) this.game.queue.push({ kind: 'stop', player: HUMAN, units: ids })
  }

  place(building: string, tx: number, ty: number): void {
    const villagers = this.selection.villagers(this.state)
    const builders = villagers.length > 0 ? villagers : this.nearestIdleVillagers(tx, ty)
    this.game.queue.push({ kind: 'place', player: HUMAN, units: builders, building, tx, ty })
  }

  train(buildingId: EntityId, unit: string): void {
    this.game.queue.push({ kind: 'train', player: HUMAN, buildingId, unit })
  }

  research(buildingId: EntityId, tech: string): void {
    this.game.queue.push({ kind: 'research', player: HUMAN, buildingId, tech })
  }

  advanceAge(buildingId: EntityId): void {
    this.game.queue.push({ kind: 'advanceAge', player: HUMAN, buildingId })
  }

  cancelQueue(buildingId: EntityId, index: number): void {
    this.game.queue.push({ kind: 'cancelQueue', player: HUMAN, buildingId, index })
  }

  setRally(buildingId: EntityId, tx: number, ty: number): void {
    this.game.queue.push({ kind: 'setRally', player: HUMAN, buildingId, tx, ty })
  }

  surrender(): void {
    this.game.queue.push({ kind: 'surrender', player: HUMAN })
  }

  /** Placing without a villager selected should still work — grab the closest. */
  private nearestIdleVillagers(tx: number, ty: number): EntityId[] {
    let best: EntityId | null = null
    let bestDistance = Infinity
    for (const unit of this.state.units.values()) {
      if (unit.owner !== HUMAN || unitDef(unit.type).class !== 'villager') continue
      const d = Math.hypot(unit.x - tx, unit.y - ty) + (unit.order.kind === 'none' ? 0 : 6)
      if (d < bestDistance) {
        bestDistance = d
        best = unit.id
      }
    }
    return best === null ? [] : [best]
  }
}
