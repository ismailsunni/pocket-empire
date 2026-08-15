import { AGES, CONFIG, TECHS, type Cost } from '../data'
import { nearestWalkable } from '../map/Tile'
import {
  buildingDef,
  canAfford,
  isUnlocked,
  maxUnitHp,
  pay,
  projectedPopulation,
  recomputePopulation,
  refund,
  spawnUnit,
  unitDef,
} from './GameState'
import { setDestination } from './Movement'
import { HUMAN, type Building, type GameState, type Player, type ProductionItem } from './types'

const MAX_QUEUE = 8

const queueItem = (building: Building, item: ProductionItem): void => {
  building.queue.push(item)
}

export const trainUnit = (state: GameState, player: Player, building: Building, unit: string): boolean => {
  const def = buildingDef(building.type)
  if (!building.complete || !def.produces?.includes(unit)) return false
  if (building.queue.length >= MAX_QUEUE) return false
  const unitData = unitDef(unit)
  if (projectedPopulation(state, player) + unitData.pop > player.popCap) {
    if (player.id === HUMAN) state.events.push({ kind: 'popCapped' })
    return false
  }
  if (!canAfford(player, unitData.cost)) {
    if (player.id === HUMAN) state.events.push({ kind: 'insufficientResources' })
    return false
  }
  pay(player, unitData.cost)
  const ticks = Math.round(unitData.trainTime * CONFIG.tickRate)
  queueItem(building, { kind: 'unit', id: unit, remaining: ticks, total: ticks })
  return true
}

export const researchTech = (state: GameState, player: Player, building: Building, tech: string): boolean => {
  const def = TECHS[tech]
  if (!def || !building.complete || def.researchedAt !== building.type) return false
  if (player.techs.includes(tech)) return false
  if (!isUnlocked(player, def.age)) return false
  if (building.queue.some((item) => item.kind === 'tech' && item.id === tech)) return false
  if (!canAfford(player, def.cost)) {
    if (player.id === HUMAN) state.events.push({ kind: 'insufficientResources' })
    return false
  }
  pay(player, def.cost)
  const ticks = Math.round(def.researchTime * CONFIG.tickRate)
  queueItem(building, { kind: 'tech', id: tech, remaining: ticks, total: ticks })
  return true
}

export const advanceAge = (state: GameState, player: Player, building: Building): boolean => {
  const next = AGES[player.ageIndex + 1]
  if (!next || !building.complete) return false
  if (next.researchedAt && next.researchedAt !== building.type) return false
  if (building.queue.some((item) => item.kind === 'age')) return false
  if (!canAfford(player, next.cost)) {
    if (player.id === HUMAN) state.events.push({ kind: 'insufficientResources' })
    return false
  }
  pay(player, next.cost)
  const ticks = Math.round(next.researchTime * CONFIG.tickRate)
  queueItem(building, { kind: 'age', id: next.id, remaining: ticks, total: ticks })
  return true
}

export const cancelQueueItem = (state: GameState, building: Building, index: number): void => {
  const item = building.queue[index]
  if (!item) return
  const player = state.players[building.owner]
  refund(player, costOf(item) as Cost)
  building.queue.splice(index, 1)
}

const costOf = (item: ProductionItem): Cost => {
  if (item.kind === 'unit') return unitDef(item.id).cost
  if (item.kind === 'tech') return TECHS[item.id].cost
  return AGES.find((age) => age.id === item.id)?.cost ?? {}
}

export const updateProduction = (state: GameState): void => {
  for (const building of state.buildings.values()) {
    if (!building.complete || building.queue.length === 0) continue
    const item = building.queue[0]
    const player = state.players[building.owner]

    if (item.kind === 'unit' && player.popUsed + unitDef(item.id).pop > player.popCap) {
      if (player.id === HUMAN && state.tick % CONFIG.tickRate === 0) {
        state.events.push({ kind: 'popCapped' })
      }
      continue
    }

    item.remaining--
    if (item.remaining > 0) continue
    building.queue.shift()

    if (item.kind === 'unit') {
      const spot = nearestWalkable(state.map, Math.floor(building.rallyX), Math.floor(building.rallyY)) ?? [
        building.tx,
        building.ty + building.size,
      ]
      const unit = spawnUnit(state, building.owner, item.id, spot[0] + 0.5, spot[1] + 0.5)
      unit.hp = maxUnitHp(state, building.owner, item.id)
      if (building.rallyX !== spot[0] + 0.5 || building.rallyY !== spot[1] + 0.5) {
        setDestination(unit, building.rallyX, building.rallyY)
      }
      recomputePopulation(state)
      state.events.push({ kind: 'unitTrained', player: building.owner, type: item.id })
    } else if (item.kind === 'tech') {
      player.techs.push(item.id)
    } else {
      player.ageIndex = AGES.findIndex((age) => age.id === item.id)
      state.events.push({ kind: 'ageAdvanced', player: player.id, age: item.id })
    }
  }
}
