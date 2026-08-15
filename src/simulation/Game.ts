import { CONFIG } from '../data'
import { PathService } from '../map/Pathfinding'
import { SpatialGrid } from '../map/SpatialGrid'
import { updateAI } from './AI'
import { clearDeadTargets, resetCombatNotifications, updateCombat } from './Combat'
import type { Command } from './Command'
import { CommandQueue } from './CommandQueue'
import { assignBuilder, cancelBuilding, placeBuilding, updateConstruction } from './Construction'
import { updateEconomy, updateStragglers } from './Economy'
import { FOG_INTERVAL, updateFog } from './Fog'
import { createGameState, unitDef } from './GameState'
import { setDestination, updateMovement } from './Movement'
import { advanceAge, cancelQueueItem, researchTech, trainUnit, updateProduction } from './Production'
import { HUMAN, type GameState, type Unit } from './types'

const MAX_CATCHUP_STEPS = 5

/**
 * One clock. The simulation advances at a fixed 20 Hz behind an accumulator and
 * rendering interpolates between the last two states (§19.2 Rule 3). Expensive
 * subsystems are staggered across ticks rather than given their own rates.
 */
export class Game {
  readonly queue = new CommandQueue()
  state: GameState
  private path: PathService
  private grid: SpatialGrid
  private accumulator = 0
  private readonly step = 1 / CONFIG.tickRate

  constructor(seed: number, restored?: GameState) {
    this.state = restored ?? createGameState(seed)
    this.path = new PathService(this.state.map)
    this.grid = new SpatialGrid(this.state.map.size)
    resetCombatNotifications()
  }

  /** Fraction of a tick elapsed, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.step
  }

  /** Advance by real elapsed time. Excess time is dropped, never fast-forwarded. */
  update(deltaSeconds: number): void {
    this.accumulator += Math.min(deltaSeconds, this.step * MAX_CATCHUP_STEPS)
    let steps = 0
    while (this.accumulator >= this.step && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= this.step
      this.tick()
      steps++
    }
  }

  tick(): void {
    const state = this.state
    if (state.status === 'over') {
      this.queue.drain()
      return
    }

    for (const command of this.queue.drain()) this.apply(command)

    if (state.mapDirty) {
      this.path.invalidate()
      state.mapDirty = false
    }
    this.path.update()
    this.grid.rebuild(state.units)

    updateMovement(state, this.path, this.grid, this.step)
    updateEconomy(state, this.step)
    updateStragglers(state)
    updateConstruction(state)
    updateProduction(state)

    if (state.tick % CONFIG.combatTickInterval === 0) {
      updateCombat(state, this.grid, this.step * CONFIG.combatTickInterval)
      clearDeadTargets(state)
    }
    if (state.tick % FOG_INTERVAL === 0) updateFog(state)
    if (state.tick % CONFIG.aiTickInterval === 0) updateAI(state, this.queue)

    this.checkVictory()
    state.tick++
  }

  private ownedUnits(player: number, ids: number[]): Unit[] {
    const units: Unit[] = []
    for (const id of ids) {
      const unit = this.state.units.get(id)
      if (unit && unit.owner === player) units.push(unit)
    }
    return units
  }

  private apply(command: Command): void {
    const state = this.state
    const player = state.players[command.player]
    if (!player || player.defeated) return

    switch (command.kind) {
      case 'move': {
        for (const unit of this.ownedUnits(command.player, command.units)) {
          unit.order = { kind: 'none' }
          unit.targetId = -1
          setDestination(unit, command.tx, command.ty)
        }
        break
      }
      case 'attackMove': {
        for (const unit of this.ownedUnits(command.player, command.units)) {
          unit.order = { kind: 'attackMove', tx: command.tx, ty: command.ty }
          unit.targetId = -1
          setDestination(unit, command.tx, command.ty)
        }
        break
      }
      case 'attack': {
        for (const unit of this.ownedUnits(command.player, command.units)) {
          if (unitDef(unit.type).class === 'villager') continue
          unit.order = { kind: 'attack', targetId: command.targetId }
          unit.targetId = command.targetId
        }
        break
      }
      case 'gather': {
        if (!state.nodes.has(command.nodeId)) break
        for (const unit of this.ownedUnits(command.player, command.units)) {
          if (unitDef(unit.type).class !== 'villager') continue
          unit.order = { kind: 'gather', nodeId: command.nodeId }
          unit.lastNodeId = command.nodeId
          unit.state = 'idle'
          unit.targetId = -1
        }
        break
      }
      case 'stop': {
        for (const unit of this.ownedUnits(command.player, command.units)) {
          unit.order = { kind: 'none' }
          unit.targetId = -1
          unit.state = 'idle'
          unit.destX = unit.x
          unit.destY = unit.y
        }
        break
      }
      case 'place': {
        const builders = this.ownedUnits(command.player, command.units).filter(
          (unit) => unitDef(unit.type).class === 'villager',
        )
        placeBuilding(state, player, command.building, command.tx, command.ty, builders)
        break
      }
      case 'assist': {
        const building = state.buildings.get(command.buildingId)
        if (!building || building.owner !== command.player || building.complete) break
        for (const unit of this.ownedUnits(command.player, command.units)) {
          if (unitDef(unit.type).class === 'villager') assignBuilder(state, unit, building)
        }
        break
      }
      case 'train': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player) {
          trainUnit(state, player, building, command.unit)
        }
        break
      }
      case 'research': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player) {
          researchTech(state, player, building, command.tech)
        }
        break
      }
      case 'advanceAge': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player) advanceAge(state, player, building)
        break
      }
      case 'cancelQueue': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player) {
          cancelQueueItem(state, building, command.index)
        }
        break
      }
      case 'demolish': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player && !building.complete) {
          cancelBuilding(state, building)
        }
        break
      }
      case 'setRally': {
        const building = state.buildings.get(command.buildingId)
        if (building && building.owner === command.player) {
          building.rallyX = command.tx
          building.rallyY = command.ty
        }
        break
      }
      case 'surrender': {
        player.defeated = true
        break
      }
    }
  }

  /**
   * Losing the Town Center is defeat (§6). A side with no entities at all is
   * also defeated, which closes the no-means-to-rebuild stalemate.
   */
  private checkVictory(): void {
    const state = this.state
    if (state.status === 'over') return
    for (const player of state.players) {
      if (player.defeated) continue
      let hasTownCenter = false
      let hasAnything = false
      for (const building of state.buildings.values()) {
        if (building.owner !== player.id) continue
        hasAnything = true
        if (building.type === 'townCenter') hasTownCenter = true
      }
      if (!hasAnything) {
        for (const unit of state.units.values()) {
          if (unit.owner === player.id) {
            hasAnything = true
            break
          }
        }
      }
      if (!hasTownCenter || !hasAnything) player.defeated = true
    }

    const alive = state.players.filter((player) => !player.defeated)
    if (alive.length <= 1) {
      state.status = 'over'
      state.winner = alive[0]?.id ?? HUMAN
      state.events.push({ kind: 'gameOver', winner: state.winner })
    }
  }
}
