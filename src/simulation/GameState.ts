import {
  AGES,
  BUILDINGS,
  CONFIG,
  RESOURCE_DATA,
  RESOURCE_KINDS,
  TECHS,
  UNITS,
  type BuildingDef,
  type Cost,
  type ResourceKind,
  type UnitClass,
  type UnitDef,
} from '../data'
import { generateMap } from '../map/MapGenerator'
import { idx, nearestWalkable } from '../map/Tile'
import { createRng } from './Random'
import {
  ENEMY,
  FOG_UNKNOWN,
  HUMAN,
  type Building,
  type EntityId,
  type GameState,
  type MapData,
  type Player,
  type PlayerId,
  type Unit,
} from './types'

export const unitDef = (type: string): UnitDef => UNITS[type]
export const buildingDef = (type: string): BuildingDef => BUILDINGS[type]

export const createPlayer = (id: PlayerId, isAI: boolean): Player => ({
  id,
  isAI,
  resources: { ...CONFIG.startingResources } as Record<ResourceKind, number>,
  popUsed: 0,
  popCap: CONFIG.population.startingCap,
  ageIndex: 0,
  techs: [],
  defeated: false,
})

export const createGameState = (seed: number): GameState => {
  const generated = generateMap(seed)
  const state: GameState = {
    seed,
    tick: 0,
    rng: createRng(seed ^ 0x9e3779b9),
    map: generated.map,
    players: [createPlayer(HUMAN, false), createPlayer(ENEMY, true)],
    units: new Map(),
    buildings: new Map(),
    nodes: generated.nodes,
    fog: new Uint8Array(generated.map.size * generated.map.size).fill(FOG_UNKNOWN),
    nextId: generated.nextId,
    status: 'playing',
    winner: -1,
    events: [],
    ai: { phase: 0, lastAttackTick: 0, attacking: false, pendingBuild: null },
    mapDirty: true,
  }

  for (const player of state.players) {
    const start = state.map.starts[player.id]
    const tc = addBuilding(state, player.id, 'townCenter', start.tx - 1, start.ty - 1, true)
    for (let i = 0; i < CONFIG.startingVillagers; i++) {
      const angle = (i / CONFIG.startingVillagers) * Math.PI * 2
      spawnUnitNear(state, player.id, 'villager', start.tx + Math.cos(angle) * 3, start.ty + Math.sin(angle) * 3)
    }
    tc.rallyX = start.tx + 2.5
    tc.rallyY = start.ty + 3.5
  }
  recomputePopulation(state)
  return state
}

// --- entities -------------------------------------------------------------

export const spawnUnit = (state: GameState, owner: PlayerId, type: string, x: number, y: number): Unit => {
  const unit: Unit = {
    id: state.nextId++,
    owner,
    type,
    x,
    y,
    px: x,
    py: y,
    hp: maxUnitHp(state, owner, type),
    state: 'idle',
    order: { kind: 'none' },
    destX: x,
    destY: y,
    carryKind: null,
    carryAmount: 0,
    lastNodeId: -1,
    cooldown: 0,
    targetId: -1,
    stuck: 0,
    gatherProgress: 0,
  }
  state.units.set(unit.id, unit)
  return unit
}

export const spawnUnitNear = (state: GameState, owner: PlayerId, type: string, x: number, y: number): Unit => {
  const spot = nearestWalkable(state.map, Math.round(x), Math.round(y)) ?? [Math.round(x), Math.round(y)]
  return spawnUnit(state, owner, type, spot[0] + 0.5, spot[1] + 0.5)
}

export const addBuilding = (
  state: GameState,
  owner: PlayerId,
  type: string,
  tx: number,
  ty: number,
  complete: boolean,
): Building => {
  const def = buildingDef(type)
  const building: Building = {
    id: state.nextId++,
    owner,
    type,
    tx,
    ty,
    size: def.size,
    hp: complete ? def.hp : Math.max(1, Math.round(def.hp * 0.1)),
    maxHp: def.hp,
    complete,
    buildProgress: complete ? def.buildTime * CONFIG.tickRate : 0,
    buildersThisTick: 0,
    spent: { ...def.cost },
    queue: [],
    rallyX: tx + def.size / 2,
    rallyY: ty + def.size + 1,
    cooldown: 0,
    farmFood: def.farmFood ?? 0,
  }
  state.buildings.set(building.id, building)
  setFootprint(state.map, building, 1)
  return building
}

export const removeBuilding = (state: GameState, building: Building): void => {
  setFootprint(state.map, building, 0)
  state.buildings.delete(building.id)
}

/** Buildings block movement (§9.1); the blocked grid is the pathing source of truth. */
export const setFootprint = (map: MapData, building: Building, value: 0 | 1): void => {
  for (let y = building.ty; y < building.ty + building.size; y++) {
    for (let x = building.tx; x < building.tx + building.size; x++) {
      if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue
      if (value === 0 && (map.nodeAt[idx(map, x, y)] !== -1 || map.terrain[idx(map, x, y)] === 1)) continue
      map.blocked[idx(map, x, y)] = value
    }
  }
}

export const buildingCenter = (building: Building): { x: number; y: number } => ({
  x: building.tx + building.size / 2,
  y: building.ty + building.size / 2,
})

export const removeNode = (state: GameState, nodeId: EntityId): void => {
  const node = state.nodes.get(nodeId)
  if (!node) return
  state.nodes.delete(nodeId)
  const i = idx(state.map, node.tx, node.ty)
  state.map.nodeAt[i] = -1
  if (state.map.terrain[i] !== 1) state.map.blocked[i] = 0
}

// --- players --------------------------------------------------------------

export const recomputePopulation = (state: GameState): void => {
  for (const player of state.players) {
    player.popUsed = 0
    player.popCap = CONFIG.population.startingCap
  }
  for (const unit of state.units.values()) {
    const player = state.players[unit.owner]
    if (player) player.popUsed += unitDef(unit.type).pop
  }
  for (const building of state.buildings.values()) {
    if (!building.complete) continue
    const def = buildingDef(building.type)
    const player = state.players[building.owner]
    if (player && def.popProvided) player.popCap += def.popProvided
  }
  for (const player of state.players) {
    player.popCap = Math.min(player.popCap, CONFIG.population.hardCap)
  }
}

/** Pop already committed to units plus everything queued, so queues cannot overshoot the cap. */
export const projectedPopulation = (state: GameState, player: Player): number => {
  let pop = player.popUsed
  for (const building of state.buildings.values()) {
    if (building.owner !== player.id) continue
    for (const item of building.queue) {
      if (item.kind === 'unit') pop += unitDef(item.id).pop
    }
  }
  return pop
}

export const canAfford = (player: Player, cost: Cost): boolean =>
  RESOURCE_KINDS.every((kind) => player.resources[kind] >= (cost[kind] ?? 0))

export const pay = (player: Player, cost: Cost): void => {
  for (const kind of RESOURCE_KINDS) player.resources[kind] -= cost[kind] ?? 0
}

export const refund = (player: Player, cost: Cost, ratio = 1): void => {
  for (const kind of RESOURCE_KINDS) {
    player.resources[kind] += Math.floor((cost[kind] ?? 0) * ratio)
  }
}

// --- technology modifiers -------------------------------------------------

export const gatherRate = (player: Player, kind: ResourceKind): number => {
  let rate = RESOURCE_DATA.gatherRates[kind]
  for (const tech of player.techs) {
    for (const effect of TECHS[tech].effects) {
      if (effect.type === 'gatherRate' && effect.resource === kind) rate *= effect.mult
    }
  }
  return rate
}

export const carryCapacity = (player: Player): number => {
  let capacity = CONFIG.carryCapacity
  for (const tech of player.techs) {
    for (const effect of TECHS[tech].effects) {
      if (effect.type === 'carryCapacity') capacity += effect.add
    }
  }
  return capacity
}

export const unitStat = (
  player: Player | undefined,
  unitClass: UnitClass,
  stat: 'attack' | 'armor' | 'hp',
  base: number,
): number => {
  let value = base
  for (const tech of player?.techs ?? []) {
    for (const effect of TECHS[tech].effects) {
      if (effect.type === 'unitStat' && effect.unitClass === unitClass && effect.stat === stat) {
        value += effect.add
      }
    }
  }
  return value
}

export const maxUnitHp = (state: GameState, owner: PlayerId, type: string): number => {
  const def = unitDef(type)
  return unitStat(state.players[owner], def.class, 'hp', def.hp)
}

export const currentAge = (player: Player) => AGES[player.ageIndex]

export const isUnlocked = (player: Player, ageId: string): boolean =>
  player.ageIndex >= AGES.findIndex((age) => age.id === ageId)
