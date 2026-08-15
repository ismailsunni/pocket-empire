import { CONFIG } from '../data'
import { NEIGHBORS, isWalkable, nearestWalkable } from '../map/Tile'
import { buildingCenter, buildingDef, carryCapacity, gatherRate, removeNode } from './GameState'
import { arrived, distance, setDestination } from './Movement'
import type { Building, EntityId, GameState, ResourceNode, Unit } from './types'

// Generous enough that neighbours pushing each other apart cannot leave a
// villager permanently one step short of its node.
const GATHER_REACH = 2.2

export const nodeCenter = (node: ResourceNode): { x: number; y: number } => ({
  x: node.tx + 0.5,
  y: node.ty + 0.5,
})

export const findDropOff = (state: GameState, unit: Unit): Building | null => {
  let best: Building | null = null
  let bestDistance = Infinity
  for (const building of state.buildings.values()) {
    if (building.owner !== unit.owner || !building.complete) continue
    if (!buildingDef(building.type).dropOff) continue
    const center = buildingCenter(building)
    const d = distance(unit.x, unit.y, center.x, center.y)
    if (d < bestDistance) {
      bestDistance = d
      best = building
    }
  }
  return best
}

/** §7.1 auto-retask: nearest same-type node within radius, else idle. */
export const findNearestNode = (
  state: GameState,
  x: number,
  y: number,
  kind: string,
  radius: number,
  accept?: (node: ResourceNode) => boolean,
): ResourceNode | null => {
  let best: ResourceNode | null = null
  let bestDistance = radius
  for (const node of state.nodes.values()) {
    if (node.kind !== kind) continue
    if (accept && !accept(node)) continue
    const d = distance(x, y, node.tx + 0.5, node.ty + 0.5)
    if (d < bestDistance) {
      bestDistance = d
      best = node
    }
  }
  return best
}

/**
 * Resource tiles block movement, so a gatherer stands on a neighbouring tile.
 * Picking the nearest walkable tile to the node instead can land the villager
 * outside gathering reach, where it re-walks to the same spot forever.
 */
const standingSpot = (state: GameState, node: ResourceNode, from: Unit): [number, number] | null => {
  let best: [number, number] | null = null
  let bestDistance = Infinity
  for (const [dx, dy] of NEIGHBORS) {
    const tx = node.tx + dx
    const ty = node.ty + dy
    if (!isWalkable(state.map, tx, ty)) continue
    const d = distance(from.x, from.y, tx + 0.5, ty + 0.5)
    if (d < bestDistance) {
      bestDistance = d
      best = [tx, ty]
    }
  }
  return best
}

const walkTo = (state: GameState, unit: Unit, x: number, y: number, returning: boolean): void => {
  const spot = nearestWalkable(state.map, Math.floor(x), Math.floor(y))
  if (!spot) {
    unit.state = 'idle'
    return
  }
  setDestination(unit, spot[0] + 0.5, spot[1] + 0.5)
  unit.state = returning ? 'returning' : 'moving'
}

export const updateEconomy = (state: GameState, dt: number): void => {
  for (const unit of state.units.values()) {
    if (unit.order.kind !== 'gather') continue
    const player = state.players[unit.owner]
    const capacity = carryCapacity(player)
    const node = state.nodes.get(unit.order.nodeId) ?? null

    // Full load: walk it back to the nearest drop-off (the Town Center in MVP).
    if (unit.carryAmount >= capacity) {
      if (unit.state === 'returning') continue
      const dropOff = findDropOff(state, unit)
      if (!dropOff) {
        unit.state = 'idle'
        continue
      }
      const center = buildingCenter(dropOff)
      if (distance(unit.x, unit.y, center.x, center.y) <= dropOff.size / 2 + GATHER_REACH) {
        deposit(state, unit)
        retask(state, unit, node)
      } else {
        walkTo(state, unit, center.x, center.y, true)
      }
      continue
    }

    if (unit.state === 'returning') {
      if (!arrived(unit)) continue
      deposit(state, unit)
      retask(state, unit, node)
      continue
    }

    if (!node) {
      retask(state, unit, null)
      continue
    }

    const center = nodeCenter(node)
    if (distance(unit.x, unit.y, center.x, center.y) > GATHER_REACH) {
      if (unit.state === 'moving' && !arrived(unit)) continue
      const spot = standingSpot(state, node, unit)
      if (!spot) {
        // Fully enclosed node: nothing can ever reach it.
        retask(state, unit, findNearestNode(state, unit.x, unit.y, node.kind, CONFIG.autoRetaskRadius))
        continue
      }
      if (arrived(unit) && Math.floor(unit.destX) === spot[0] && Math.floor(unit.destY) === spot[1]) {
        // Standing where we meant to and still out of reach: give up on this node.
        retask(state, unit, findNearestNode(state, unit.x, unit.y, node.kind, CONFIG.autoRetaskRadius))
        continue
      }
      setDestination(unit, spot[0] + 0.5, spot[1] + 0.5)
      continue
    }

    unit.state = 'gathering'
    unit.lastNodeId = node.id
    unit.gatherProgress += gatherRate(player, node.kind) * dt
    const taken = Math.floor(unit.gatherProgress)
    if (taken <= 0) continue
    unit.gatherProgress -= taken
    const available = node.renewable ? taken : Math.min(taken, node.amount)
    if (available <= 0) {
      depleteNode(state, node)
      continue
    }
    if (!node.renewable) node.amount -= available
    if (unit.carryKind !== node.kind) {
      unit.carryKind = node.kind
      unit.carryAmount = 0
    }
    unit.carryAmount += available
    if (!node.renewable && node.amount <= 0) depleteNode(state, node)
  }
}

const deposit = (state: GameState, unit: Unit): void => {
  if (unit.carryKind && unit.carryAmount > 0) {
    state.players[unit.owner].resources[unit.carryKind] += unit.carryAmount
  }
  unit.carryAmount = 0
  unit.carryKind = null
}

/** Send the villager back to its node, or to the nearest equivalent one. */
const retask = (state: GameState, unit: Unit, node: ResourceNode | null): void => {
  const target = node ?? findFallback(state, unit)
  if (!target) {
    unit.order = { kind: 'none' }
    unit.state = 'idle'
    return
  }
  unit.order = { kind: 'gather', nodeId: target.id }
  const spot = standingSpot(state, target, unit)
  if (spot) setDestination(unit, spot[0] + 0.5, spot[1] + 0.5)
  else {
    const center = nodeCenter(target)
    walkTo(state, unit, center.x, center.y, false)
  }
}

const findFallback = (state: GameState, unit: Unit): ResourceNode | null => {
  const previous = unit.lastNodeId >= 0 ? state.nodes.get(unit.lastNodeId) : undefined
  const kind = previous?.kind ?? unit.carryKind
  if (!kind) return null
  return findNearestNode(state, unit.x, unit.y, kind, CONFIG.autoRetaskRadius)
}

const depleteNode = (state: GameState, node: ResourceNode): void => {
  if (node.renewable) return
  removeNode(state, node.id)
  for (const unit of state.units.values()) {
    if (unit.order.kind !== 'gather' || unit.order.nodeId !== node.id) continue
    retask(state, unit, findNearestNode(state, unit.x, unit.y, node.kind, CONFIG.autoRetaskRadius))
  }
}

/** Carrying a load with nothing to do: deliver it before going idle. */
export const updateStragglers = (state: GameState): void => {
  for (const unit of state.units.values()) {
    if (unit.carryAmount <= 0 || unit.order.kind !== 'none') continue
    if (unit.state !== 'idle' && unit.state !== 'returning') continue
    const dropOff = findDropOff(state, unit)
    if (!dropOff) continue
    const center = buildingCenter(dropOff)
    if (distance(unit.x, unit.y, center.x, center.y) <= dropOff.size / 2 + GATHER_REACH) {
      deposit(state, unit)
      unit.state = 'idle'
    } else if (unit.state === 'idle') {
      walkTo(state, unit, center.x, center.y, true)
    }
  }
}

export const nodeIdsOfKind = (state: GameState, kind: string): EntityId[] => {
  const ids: EntityId[] = []
  for (const node of state.nodes.values()) if (node.kind === kind) ids.push(node.id)
  return ids
}
