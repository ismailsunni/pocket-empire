import { COMBAT, CONFIG } from '../data'
import type { SpatialGrid } from '../map/SpatialGrid'
import {
  buildingCenter,
  buildingDef,
  recomputePopulation,
  removeBuilding,
  unitDef,
  unitStat,
} from './GameState'
import { distance, setDestination } from './Movement'
import { HUMAN, type Building, type EntityId, type GameState, type Unit } from './types'

const UNDER_ATTACK_COOLDOWN = 100 // ticks (5s at 20Hz)
let lastUnderAttackTick = -1000

export interface Target {
  x: number
  y: number
  radius: number
  owner: number
  klass: string
  armor: number
}

export const isMilitary = (unit: Unit): boolean => unitDef(unit.type).class !== 'villager'

export const resolveTarget = (state: GameState, id: EntityId): Target | null => {
  const unit = state.units.get(id)
  if (unit) {
    const def = unitDef(unit.type)
    return {
      x: unit.x,
      y: unit.y,
      radius: 0.4,
      owner: unit.owner,
      klass: def.class,
      armor: unitStat(state.players[unit.owner], def.class, 'armor', def.armor),
    }
  }
  const building = state.buildings.get(id)
  if (building) {
    const center = buildingCenter(building)
    return {
      x: center.x,
      y: center.y,
      radius: building.size / 2,
      owner: building.owner,
      klass: 'building',
      armor: COMBAT.buildingArmor,
    }
  }
  return null
}

/** damage = max(1, attack × classBonus − armor). Deterministic, no rolls (§12). */
export const computeDamage = (
  attackerClass: string,
  attack: number,
  target: Target,
): number => {
  const bonus = COMBAT.bonus[attackerClass]?.[target.klass] ?? 1
  return Math.max(COMBAT.minimumDamage, Math.round(attack * bonus) - target.armor)
}

export const applyDamage = (state: GameState, targetId: EntityId, amount: number, x: number, y: number): void => {
  const unit = state.units.get(targetId)
  if (unit) {
    unit.hp -= amount
    if (unit.owner === HUMAN) noteUnderAttack(state, x, y)
    return
  }
  const building = state.buildings.get(targetId)
  if (building) {
    building.hp -= amount
    if (building.owner === HUMAN) noteUnderAttack(state, x, y)
  }
}

const noteUnderAttack = (state: GameState, x: number, y: number): void => {
  if (state.tick - lastUnderAttackTick < UNDER_ATTACK_COOLDOWN) return
  lastUnderAttackTick = state.tick
  state.events.push({ kind: 'underAttack', player: HUMAN, x, y })
}

export const resetCombatNotifications = (): void => {
  lastUnderAttackTick = -1000
}

const nearestHostile = (
  state: GameState,
  owner: number,
  x: number,
  y: number,
  radius: number,
  grid: SpatialGrid,
  militaryOnly: boolean,
): EntityId => {
  let best = -1
  let bestDistance = radius
  for (const id of grid.query(x, y, radius)) {
    const other = state.units.get(id)
    if (!other || other.owner === owner) continue
    if (militaryOnly && !isMilitary(other)) continue
    const d = distance(x, y, other.x, other.y)
    if (d < bestDistance) {
      bestDistance = d
      best = id
    }
  }
  if (best !== -1) return best
  // Nothing mobile nearby: buildings are valid targets too.
  for (const building of state.buildings.values()) {
    if (building.owner === owner) continue
    const center = buildingCenter(building)
    const d = distance(x, y, center.x, center.y) - building.size / 2
    if (d < bestDistance) {
      bestDistance = d
      best = building.id
    }
  }
  return best
}

export const updateCombat = (state: GameState, grid: SpatialGrid, dt: number): void => {
  for (const unit of state.units.values()) unit.cooldown = Math.max(0, unit.cooldown - dt)
  for (const building of state.buildings.values()) {
    building.cooldown = Math.max(0, building.cooldown - dt)
  }

  for (const unit of state.units.values()) {
    const def = unitDef(unit.type)
    const military = def.class !== 'villager'

    if (!military) {
      updateVillagerFlight(state, unit, grid)
      continue
    }

    // Passive aggression: idle military engages anything entering vision (§12).
    if (unit.targetId === -1 && (unit.order.kind === 'none' || unit.order.kind === 'attackMove')) {
      const radius = unit.order.kind === 'attackMove' ? CONFIG.aggroRadius : def.vision
      unit.targetId = nearestHostile(state, unit.owner, unit.x, unit.y, radius, grid, false)
    }

    if (unit.targetId === -1) continue
    const target = resolveTarget(state, unit.targetId)
    if (!target || target.owner === unit.owner) {
      unit.targetId = -1
      // Auto-acquire the nearest hostile in a small radius, else hold (§12).
      const next = nearestHostile(state, unit.owner, unit.x, unit.y, CONFIG.reacquireRadius, grid, false)
      unit.targetId = next
      if (next === -1) {
        if (unit.order.kind === 'attack') unit.order = { kind: 'none' }
        if (unit.state === 'attacking') unit.state = 'idle'
      }
      continue
    }

    const reach = def.range + target.radius + 0.3
    const d = distance(unit.x, unit.y, target.x, target.y)
    if (d > reach) {
      if (unit.state !== 'moving' || tileChanged(unit, target)) {
        setDestination(unit, target.x, target.y)
      }
      continue
    }

    unit.state = 'attacking'
    if (unit.cooldown > 0) continue
    unit.cooldown = def.cooldown
    const attack = unitStat(state.players[unit.owner], def.class, 'attack', def.attack)
    applyDamage(state, unit.targetId, computeDamage(def.class, attack, target), target.x, target.y)
  }

  updateTowers(state, grid)
  removeDead(state)
}

const tileChanged = (unit: Unit, target: Target): boolean =>
  Math.floor(unit.destX) !== Math.floor(target.x) || Math.floor(unit.destY) !== Math.floor(target.y)

/** Villagers do not fight back — they run for the nearest Town Center (§12). */
const updateVillagerFlight = (state: GameState, unit: Unit, grid: SpatialGrid): void => {
  const threat = nearestHostile(
    state,
    unit.owner,
    unit.x,
    unit.y,
    CONFIG.villagerFleeRadius,
    grid,
    true,
  )
  if (threat === -1) {
    if (unit.state === 'fleeing') unit.state = 'idle'
    return
  }
  let refuge: Building | null = null
  let bestDistance = Infinity
  for (const building of state.buildings.values()) {
    if (building.owner !== unit.owner || !building.complete) continue
    if (!buildingDef(building.type).dropOff) continue
    const center = buildingCenter(building)
    const d = distance(unit.x, unit.y, center.x, center.y)
    if (d < bestDistance) {
      bestDistance = d
      refuge = building
    }
  }
  if (!refuge) return
  const center = buildingCenter(refuge)
  if (bestDistance < refuge.size / 2 + 1.5) return
  unit.order = { kind: 'none' }
  setDestination(unit, center.x, center.y)
  unit.state = 'fleeing'
}

const updateTowers = (state: GameState, grid: SpatialGrid): void => {
  for (const building of state.buildings.values()) {
    const def = buildingDef(building.type)
    if (!def.attack || !building.complete) continue
    const center = buildingCenter(building)
    const targetId = nearestHostile(
      state,
      building.owner,
      center.x,
      center.y,
      def.range ?? 7,
      grid,
      false,
    )
    if (targetId === -1) continue
    const target = resolveTarget(state, targetId)
    if (!target || target.klass === 'building') continue
    if (building.cooldown > 0) continue
    building.cooldown = def.cooldown ?? 2
    applyDamage(state, targetId, computeDamage('tower', def.attack, target), target.x, target.y)
  }
}

const removeDead = (state: GameState): void => {
  let populationChanged = false
  for (const unit of [...state.units.values()]) {
    if (unit.hp > 0) continue
    state.units.delete(unit.id)
    populationChanged = true
  }
  for (const building of [...state.buildings.values()]) {
    if (building.hp > 0) continue
    // A destroyed farm takes its food node with it.
    for (const node of [...state.nodes.values()]) {
      if (node.buildingId === building.id) state.nodes.delete(node.id)
    }
    removeBuilding(state, building)
    state.mapDirty = true
    populationChanged = true
  }
  if (populationChanged) recomputePopulation(state)
}

export const clearDeadTargets = (state: GameState): void => {
  for (const unit of state.units.values()) {
    if (unit.targetId !== -1 && !resolveTarget(state, unit.targetId)) unit.targetId = -1
    if (unit.order.kind === 'attack' && !resolveTarget(state, unit.order.targetId)) {
      unit.order = { kind: 'none' }
    }
  }
}
