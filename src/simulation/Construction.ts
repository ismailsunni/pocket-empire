import { CONFIG, type Cost } from '../data'
import { idx, inBounds } from '../map/Tile'
import {
  addBuilding,
  buildingCenter,
  buildingDef,
  canAfford,
  isUnlocked,
  pay,
  recomputePopulation,
  refund,
  removeBuilding,
} from './GameState'
import { arrived, distance, pushUnitsOutOfFootprint, setDestination } from './Movement'
import { FOG_UNKNOWN, HUMAN, type Building, type GameState, type Player, type Unit } from './types'

const BUILD_REACH = 1.8

export type PlacementResult = 'ok' | 'blocked' | 'unexplored' | 'locked' | 'poor'

export const checkPlacement = (
  state: GameState,
  player: Player,
  type: string,
  tx: number,
  ty: number,
): PlacementResult => {
  const def = buildingDef(type)
  if (!isUnlocked(player, def.age)) return 'locked'
  for (let y = ty; y < ty + def.size; y++) {
    for (let x = tx; x < tx + def.size; x++) {
      if (!inBounds(state.map, x, y)) return 'blocked'
      const i = idx(state.map, x, y)
      // Water, resource nodes and existing buildings all block (§9.1).
      // Units standing here do not — they are pushed out on placement.
      if (state.map.blocked[i] === 1) return 'blocked'
      if (player.id === HUMAN && state.fog[i] === FOG_UNKNOWN) return 'unexplored'
    }
  }
  if (!canAfford(player, def.cost)) return 'poor'
  return 'ok'
}

export const placeBuilding = (
  state: GameState,
  player: Player,
  type: string,
  tx: number,
  ty: number,
  builders: Unit[],
): Building | null => {
  const result = checkPlacement(state, player, type, tx, ty)
  if (result !== 'ok') {
    if (player.id === HUMAN) {
      state.events.push(result === 'poor' ? { kind: 'insufficientResources' } : { kind: 'popCapped' })
    }
    return null
  }
  const def = buildingDef(type)
  pay(player, def.cost) // resources are consumed at placement, not completion (§9.1)
  const building = addBuilding(state, player.id, type, tx, ty, false)
  pushUnitsOutOfFootprint(state, tx, ty, def.size)
  state.mapDirty = true
  for (const builder of builders) assignBuilder(builder, building)
  return building
}

export const assignBuilder = (unit: Unit, building: Building): void => {
  unit.order = { kind: 'build', buildingId: building.id }
  const center = buildingCenter(building)
  const angle = ((unit.id % 8) / 8) * Math.PI * 2
  setDestination(
    unit,
    center.x + Math.cos(angle) * (building.size / 2 + 0.9),
    center.y + Math.sin(angle) * (building.size / 2 + 0.9),
  )
}

export const cancelBuilding = (state: GameState, building: Building): void => {
  const player = state.players[building.owner]
  refund(player, building.spent as Cost, CONFIG.cancelRefundRatio)
  releaseBuilders(state, building)
  removeBuilding(state, building)
  state.mapDirty = true
  recomputePopulation(state)
}

export const releaseBuilders = (state: GameState, building: Building): void => {
  for (const unit of state.units.values()) {
    if (unit.order.kind === 'build' && unit.order.buildingId === building.id) {
      unit.order = { kind: 'none' }
      unit.state = 'idle'
    }
  }
}

export const updateConstruction = (state: GameState): void => {
  for (const building of state.buildings.values()) building.buildersThisTick = 0

  for (const unit of state.units.values()) {
    if (unit.order.kind !== 'build') continue
    const building = state.buildings.get(unit.order.buildingId)
    if (!building || building.complete) {
      unit.order = { kind: 'none' }
      if (unit.state === 'building') unit.state = 'idle'
      continue
    }
    const center = buildingCenter(building)
    if (distance(unit.x, unit.y, center.x, center.y) > building.size / 2 + BUILD_REACH) {
      if (unit.state === 'moving' && !arrived(unit)) continue
      assignBuilder(unit, building)
      continue
    }
    unit.state = 'building'
    building.buildersThisTick++
  }

  for (const building of state.buildings.values()) {
    if (building.complete || building.buildersThisTick === 0) continue
    const def = buildingDef(building.type)
    // Extra builders help sub-linearly (§9.1).
    const rate = Math.pow(building.buildersThisTick, CONFIG.multiBuilderExponent)
    const total = def.buildTime * CONFIG.tickRate
    building.buildProgress = Math.min(total, building.buildProgress + rate)
    building.hp = Math.max(1, Math.round(def.hp * (0.1 + 0.9 * (building.buildProgress / total))))
    if (building.buildProgress >= total) completeBuilding(state, building)
  }
}

export const completeBuilding = (state: GameState, building: Building): void => {
  const def = buildingDef(building.type)
  building.complete = true
  building.hp = def.hp
  if (def.farmFood) {
    // A farm is a renewable food node (§7.1) that happens to have hit points.
    const node = {
      id: state.nextId++,
      kind: 'food' as const,
      tx: building.tx,
      ty: building.ty,
      amount: def.farmFood,
      renewable: true,
      buildingId: building.id,
    }
    state.nodes.set(node.id, node)
  }
  releaseBuildersToFarm(state, building)
  recomputePopulation(state)
  state.events.push({ kind: 'buildingComplete', player: building.owner, type: building.type })
}

/** Builders roll onto the farm they just finished instead of standing idle. */
const releaseBuildersToFarm = (state: GameState, building: Building): void => {
  const farmNode = [...state.nodes.values()].find((node) => node.buildingId === building.id)
  for (const unit of state.units.values()) {
    if (unit.order.kind !== 'build' || unit.order.buildingId !== building.id) continue
    if (farmNode) {
      unit.order = { kind: 'gather', nodeId: farmNode.id }
      unit.state = 'idle'
      return
    }
    unit.order = { kind: 'none' }
    unit.state = 'idle'
  }
}
