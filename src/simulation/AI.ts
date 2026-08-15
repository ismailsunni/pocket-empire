import { AGES, CONFIG, type ResourceKind } from '../data'
import type { CommandQueue } from './CommandQueue'
import { findNearestNode } from './Economy'
import { buildingCenter, buildingDef, canAfford, isUnlocked } from './GameState'
import { checkPlacement } from './Construction'
import { isMilitary } from './Combat'
import { distance } from './Movement'
import { ENEMY, type Building, type GameState, type Player, type Unit } from './types'

const TARGET_VILLAGERS = 22
const ATTACK_AT = 8
const RETREAT_AT = 2
const GATHER_MIX: [ResourceKind, number][] = [
  ['food', 0.4],
  ['wood', 0.35],
  ['gold', 0.15],
  ['stone', 0.1],
]

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

const freeVillagers = (units: Unit[], count: number): Unit[] =>
  units
    .filter((unit) => unit.type === 'villager')
    .sort((a, b) => a.id - b.id)
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

  switch (state.ai.phase % PHASES) {
    case 0:
      assignIdleVillagers(state, queue, player, units)
      break
    case 1:
      if (tc && units.filter((u) => u.type === 'villager').length < TARGET_VILLAGERS) {
        queue.push({ kind: 'train', player: player.id, buildingId: tc.id, unit: 'villager' })
      }
      break
    case 2:
      if (player.popCap - player.popUsed <= 3 && player.popCap < CONFIG.population.hardCap) {
        build(state, queue, player, units, buildings, 'house')
      }
      break
    case 3:
      buildMilitaryInfrastructure(state, queue, player, units, buildings)
      break
    case 4:
      trainArmy(queue, player, buildings)
      break
    case 5:
      manageAttack(state, queue, player, military)
      break
  }
  state.ai.phase++
}

const assignIdleVillagers = (
  state: GameState,
  queue: CommandQueue,
  player: Player,
  units: Unit[],
): void => {
  const villagers = units.filter((unit) => unit.type === 'villager')
  const busy = villagers.filter((unit) => unit.order.kind !== 'none').length
  const idle = villagers.filter((unit) => unit.order.kind === 'none')
  if (idle.length === 0) return

  // Keep the resource mix roughly on target rather than swarming one node type.
  const assigned: Record<string, number> = { food: 0, wood: 0, gold: 0, stone: 0 }
  for (const unit of villagers) {
    if (unit.order.kind !== 'gather') continue
    const node = state.nodes.get(unit.order.nodeId)
    if (node) assigned[node.kind]++
  }
  const total = Math.max(1, busy)

  for (const unit of idle) {
    let bestKind: ResourceKind = 'food'
    let worstRatio = Infinity
    for (const [kind, share] of GATHER_MIX) {
      const ratio = assigned[kind] / total / share
      if (ratio < worstRatio) {
        worstRatio = ratio
        bestKind = kind
      }
    }
    const node =
      findNearestNode(state, unit.x, unit.y, bestKind, 40) ??
      findNearestNode(state, unit.x, unit.y, 'food', 60) ??
      findNearestNode(state, unit.x, unit.y, 'wood', 60)
    if (!node) continue
    assigned[bestKind]++
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
  if (player.ageIndex === 0) {
    const tc = townCenter(buildings)
    const next = AGES[player.ageIndex + 1]
    if (tc && next && canAfford(player, next.cost)) {
      queue.push({ kind: 'advanceAge', player: player.id, buildingId: tc.id })
    }
    return
  }
  if (!has('archeryRange')) {
    build(state, queue, player, units, buildings, 'archeryRange')
    return
  }
  const farms = buildings.filter((b) => b.type === 'farm').length
  if (farms < 4) build(state, queue, player, units, buildings, 'farm')
  else if (!has('tower')) build(state, queue, player, units, buildings, 'tower')
}

const trainArmy = (queue: CommandQueue, player: Player, buildings: Building[]): void => {
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
