import { AGES, CONFIG, type ResourceKind } from '../data'
import type { CommandQueue } from './CommandQueue'
import { findNearestNode } from './Economy'
import { buildingCenter, buildingDef, canAfford, isUnlocked } from './GameState'
import { checkPlacement } from './Construction'
import { isMilitary } from './Combat'
import { distance } from './Movement'
import { ENEMY, type Building, type EntityId, type GameState, type Player, type Unit } from './types'

const TARGET_VILLAGERS = 22
/** Below this the AI keeps making villagers even while saving for the next age. */
const MIN_VILLAGERS_BEFORE_SAVING = 16
/** Army is trained from surplus: villagers come first, or the economy never grows. */
const ARMY_FOOD_SURPLUS = 120
const MINIMUM_DEFENCE = 4
/** Only bank for the age once it is within reach, so the army is not capped forever. */
const SAVING_THRESHOLD = 160
const ATTACK_AT = 8
const RETREAT_AT = 2
const GATHER_MIX: [ResourceKind, number][] = [
  ['food', 0.5],
  ['wood', 0.28],
  ['gold', 0.15],
  ['stone', 0.07],
]
/** Above this a resource is saturated and gatherers are better used elsewhere. */
const SATURATED = 450
const SCARCE = 150

const PHASES = 6

const own = (state: GameState, player: Player) => {
  const units: Unit[] = []
  const buildings: Building[] = []
  for (const unit of state.units.values()) if (unit.owner === player.id) units.push(unit)
  for (const building of state.buildings.values()) {
    if (building.owner === player.id) buildings.push(building)
  }
  return { units, buildings }
}

const townCenter = (buildings: Building[]): Building | undefined =>
  buildings.find((b) => b.type === 'townCenter' && b.complete)

/** First valid footprint on an expanding ring around the town centre. */
const findSpot = (
  state: GameState,
  player: Player,
  type: string,
  from: Building,
): [number, number] | null => {
  for (let r = 3; r < 18; r += 1) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const tx = Math.round(from.tx + Math.cos(angle) * r)
      const ty = Math.round(from.ty + Math.sin(angle) * r)
      if (checkPlacement(state, player, type, tx, ty) === 'ok') return [tx, ty]
    }
  }
  return null
}

/**
 * Idle villagers first, gatherers next, and builders last — pulling a villager
 * off a half-finished building strands that building with nobody working it.
 */
const priority = (unit: Unit): number =>
  unit.order.kind === 'none' ? 0 : unit.order.kind === 'build' ? 2 : 1

const freeVillagers = (units: Unit[], count: number): Unit[] =>
  units
    .filter((unit) => unit.type === 'villager')
    .sort((a, b) => priority(a) - priority(b) || a.id - b.id)
    .slice(0, count)

const build = (
  state: GameState,
  queue: CommandQueue,
  player: Player,
  units: Unit[],
  buildings: Building[],
  type: string,
): boolean => {
  const tc = townCenter(buildings)
  if (!tc) return false
  const def = buildingDef(type)
  if (!isUnlocked(player, def.age) || !canAfford(player, def.cost)) return false
  if (buildings.some((b) => b.type === type && !b.complete)) return false
  const spot = findSpot(state, player, type, tc)
  if (!spot) return false
  const builders = freeVillagers(units, 2)
  if (builders.length === 0) return false
  queue.push({
    kind: 'place',
    player: player.id,
    units: builders.map((unit) => unit.id),
    building: type,
    tx: spot[0],
    ty: spot[1],
  })
  return true
}

/**
 * The AI issues the same commands through the same queue as the player (§15).
 * One subsystem is evaluated per cadence tick so the work is spread out.
 */
export const updateAI = (state: GameState, queue: CommandQueue): void => {
  const player = state.players[ENEMY]
  if (player.defeated || state.status !== 'playing') return
  const { units, buildings } = own(state, player)
  const tc = townCenter(buildings)
  const military = units.filter(isMilitary)
  resumeStalledConstruction(queue, player, units, buildings)

  switch (state.ai.phase % PHASES) {
    case 0:
      assignIdleVillagers(state, queue, player, units)
      break
    case 1: {
      const villagers = units.filter((u) => u.type === 'villager').length
      // Without this the AI spends every scrap of food on villagers and never
      // banks the 400 it needs to reach Feudal.
      const saving = savingForAge(player, buildings) && villagers >= MIN_VILLAGERS_BEFORE_SAVING
      if (tc && !saving && villagers < TARGET_VILLAGERS) {
        queue.push({ kind: 'train', player: player.id, buildingId: tc.id, unit: 'villager' })
      }
      break
    }
    case 2:
      if (player.popCap - player.popUsed <= 3 && player.popCap < CONFIG.population.hardCap) {
        build(state, queue, player, units, buildings, 'house')
      }
      break
    case 3:
      buildMilitaryInfrastructure(state, queue, player, units, buildings)
      break
    case 4:
      trainArmy(queue, player, buildings, military.length)
      break
    case 5:
      manageAttack(state, queue, player, military)
      break
  }
  state.ai.phase++
}

/**
 * A building nobody is working on never finishes, and the AI would happily
 * leave one standing at 5% for the rest of the match.
 */
const resumeStalledConstruction = (
  queue: CommandQueue,
  player: Player,
  units: Unit[],
  buildings: Building[],
): void => {
  const stalled = buildings.find((b) => !b.complete && b.buildersThisTick === 0)
  if (!stalled) return
  const assigned = units.some(
    (unit) => unit.order.kind === 'build' && unit.order.buildingId === stalled.id,
  )
  if (assigned) return
  const builders = freeVillagers(units, 2)
  if (builders.length === 0) return
  queue.push({
    kind: 'assist',
    player: player.id,
    units: builders.map((unit) => unit.id),
    buildingId: stalled.id,
  })
}

const assignIdleVillagers = (
  state: GameState,
  queue: CommandQueue,
  player: Player,
  units: Unit[],
): void => {
  const villagers = units.filter((unit) => unit.type === 'villager')
  const busy = villagers.filter((unit) => unit.order.kind !== 'none').length
  const idle = [...villagers.filter((unit) => unit.order.kind === 'none')]

  // Nothing idle, but the stockpile is lopsided: move a couple of gatherers off
  // a saturated resource rather than accumulating wood the AI cannot spend.
  if (idle.length === 0) {
    const scarce = GATHER_MIX.find(([kind]) => player.resources[kind] < SCARCE)
    if (!scarce) return
    for (const unit of villagers) {
      if (idle.length >= 2) break
      if (unit.order.kind !== 'gather') continue
      const node = state.nodes.get(unit.order.nodeId)
      if (!node || node.kind === scarce[0]) continue
      if (player.resources[node.kind] < SATURATED) continue
      idle.push(unit)
    }
    if (idle.length === 0) return
  }

  // Keep the resource mix roughly on target rather than swarming one node type.
  const assigned: Record<string, number> = { food: 0, wood: 0, gold: 0, stone: 0 }
  const crowding = new Map<EntityId, number>()
  for (const unit of villagers) {
    if (unit.order.kind !== 'gather') continue
    const node = state.nodes.get(unit.order.nodeId)
    if (!node) continue
    assigned[node.kind]++
    crowding.set(node.id, (crowding.get(node.id) ?? 0) + 1)
  }
  const total = Math.max(1, busy)

  for (const unit of idle) {
    let bestKind: ResourceKind = 'food'
    let worstRatio = Infinity
    for (const [kind, base] of GATHER_MIX) {
      const share = player.resources[kind] > SATURATED ? 0 : base
      if (share === 0) continue
      const ratio = assigned[kind] / total / share
      if (ratio < worstRatio) {
        worstRatio = ratio
        bestKind = kind
      }
    }
    // Spread across nodes: piling every villager onto the single nearest tile
    // just makes them shove each other out of gathering range.
    const free = (kind: string, radius: number) =>
      findNearestNode(state, unit.x, unit.y, kind, radius, (candidate) =>
        candidate.renewable ? true : (crowding.get(candidate.id) ?? 0) < 1,
      )
    const node = free(bestKind, 40) ?? free('food', 60) ?? free('wood', 60)
    if (!node) continue
    assigned[bestKind]++
    crowding.set(node.id, (crowding.get(node.id) ?? 0) + 1)
    queue.push({ kind: 'gather', player: player.id, units: [unit.id], nodeId: node.id })
  }
}

const buildMilitaryInfrastructure = (
  state: GameState,
  queue: CommandQueue,
  player: Player,
  units: Unit[],
  buildings: Building[],
): void => {
  const has = (type: string) => buildings.some((b) => b.type === type)
  if (!has('barracks')) {
    build(state, queue, player, units, buildings, 'barracks')
    return
  }
  // Farms are a Dark Age building: without them food income collapses as soon
  // as the berries near the base run out, and the age advance never lands.
  const farms = buildings.filter((b) => b.type === 'farm').length
  if (farms < 4) {
    build(state, queue, player, units, buildings, 'farm')
    return
  }
  if (player.ageIndex === 0) {
    const tc = townCenter(buildings)
    const next = AGES[player.ageIndex + 1]
    if (tc && next && canAfford(player, next.cost)) {
      queue.push({ kind: 'advanceAge', player: player.id, buildingId: tc.id })
    }
    return
  }
  if (!has('archeryRange')) build(state, queue, player, units, buildings, 'archeryRange')
  else if (!has('tower')) build(state, queue, player, units, buildings, 'tower')
}

/** True while the next age is affordable-in-principle and not yet under way. */
const savingForAge = (player: Player, buildings: Building[]): boolean => {
  const next = AGES[player.ageIndex + 1]
  if (!next) return false
  if (buildings.some((b) => b.queue.some((item) => item.kind === 'age'))) return false
  if (player.resources.food < SAVING_THRESHOLD) return false
  return buildings.some((b) => b.type === 'barracks' && b.complete)
}

const HOLDING_ARMY = 6

const trainArmy = (
  queue: CommandQueue,
  player: Player,
  buildings: Building[],
  armySize: number,
): void => {
  const saving = savingForAge(player, buildings)
  if (saving && armySize >= HOLDING_ARMY) return
  if (armySize >= MINIMUM_DEFENCE && player.resources.food < ARMY_FOOD_SURPLUS) return
  for (const building of buildings) {
    if (!building.complete || building.queue.length >= 3) continue
    const produces = buildingDef(building.type).produces
    if (!produces || produces.includes('villager')) continue
    queue.push({ kind: 'train', player: player.id, buildingId: building.id, unit: produces[0] })
  }
}

const manageAttack = (
  state: GameState,
  queue: CommandQueue,
  player: Player,
  military: Unit[],
): void => {
  const enemyTc = [...state.buildings.values()].find(
    (b) => b.owner !== player.id && b.type === 'townCenter',
  )
  const home = [...state.buildings.values()].find(
    (b) => b.owner === player.id && b.type === 'townCenter',
  )

  if (state.ai.attacking) {
    // Army wiped: fall back and rebuild rather than trickling in (§15).
    if (military.length <= RETREAT_AT) {
      state.ai.attacking = false
      if (home) {
        const center = buildingCenter(home)
        queue.push({
          kind: 'move',
          player: player.id,
          units: military.map((unit) => unit.id),
          tx: center.x,
          ty: center.y,
        })
      }
      return
    }
    if (!enemyTc) return
    const center = buildingCenter(enemyTc)
    const stragglers = military.filter(
      (unit) => unit.order.kind === 'none' && distance(unit.x, unit.y, center.x, center.y) > 6,
    )
    if (stragglers.length > 0) {
      queue.push({
        kind: 'attackMove',
        player: player.id,
        units: stragglers.map((unit) => unit.id),
        tx: center.x,
        ty: center.y,
      })
    }
    return
  }

  if (military.length >= ATTACK_AT && enemyTc) {
    state.ai.attacking = true
    state.ai.lastAttackTick = state.tick
    const center = buildingCenter(enemyTc)
    queue.push({
      kind: 'attackMove',
      player: player.id,
      units: military.map((unit) => unit.id),
      tx: center.x,
      ty: center.y,
    })
  }
}
