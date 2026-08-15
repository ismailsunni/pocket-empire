import { describe, expect, it } from 'vitest'
import { AGES, BUILDINGS } from '../data'
import { generateMap } from '../map/MapGenerator'
import { isWalkable, NEIGHBORS, idx } from '../map/Tile'
import { computeDamage } from './Combat'
import { checkPlacement } from './Construction'
import { Game } from './Game'
import { isUnlocked } from './GameState'
import { distance } from './Movement'
import { ENEMY, HUMAN, type GameState } from './types'

/** Cheap structural digest — enough to catch divergence between two runs. */
const digest = (state: GameState): string => {
  const parts: string[] = [`t${state.tick}`]
  for (const unit of state.units.values()) {
    parts.push(`${unit.id}:${unit.type}:${unit.x.toFixed(4)}:${unit.y.toFixed(4)}:${unit.hp}`)
  }
  for (const building of state.buildings.values()) {
    parts.push(`b${building.id}:${building.type}:${building.hp}:${building.buildProgress}`)
  }
  for (const player of state.players) {
    parts.push(`p${player.id}:${JSON.stringify(player.resources)}:${player.ageIndex}`)
  }
  return parts.join('|')
}

const runTicks = (game: Game, ticks: number): void => {
  for (let i = 0; i < ticks; i++) game.tick()
}

describe('map generation', () => {
  it('produces a symmetric map with a walkable path between both starts', () => {
    const { map } = generateMap(12345)
    const [a, b] = map.starts
    expect(isWalkable(map, a.tx, a.ty)).toBe(true)
    expect(isWalkable(map, b.tx, b.ty)).toBe(true)

    const seen = new Uint8Array(map.size * map.size)
    const queue = [idx(map, a.tx, a.ty)]
    seen[queue[0]] = 1
    let reached = false
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]
      if (at === idx(map, b.tx, b.ty)) {
        reached = true
        break
      }
      const tx = at % map.size
      const ty = (at / map.size) | 0
      for (const [dx, dy] of NEIGHBORS) {
        if (!isWalkable(map, tx + dx, ty + dy)) continue
        const ni = idx(map, tx + dx, ty + dy)
        if (seen[ni]) continue
        seen[ni] = 1
        queue.push(ni)
      }
    }
    expect(reached).toBe(true)
  })

  it('is its own 180° rotation, so both starts are equally supplied', () => {
    const { map } = generateMap(777)
    const n = map.size * map.size
    for (let i = 0; i < n; i++) expect(map.terrain[i]).toBe(map.terrain[n - 1 - i])
  })
})

describe('determinism (§19.2 Rule 2)', () => {
  it('same seed and command sequence produce identical state', () => {
    const play = () => {
      const game = new Game(4242)
      const villagers = [...game.state.units.values()].filter((unit) => unit.owner === HUMAN)
      const node = [...game.state.nodes.values()].find((candidate) => candidate.kind === 'wood')
      game.queue.push({
        kind: 'gather',
        player: HUMAN,
        units: villagers.map((unit) => unit.id),
        nodeId: node!.id,
      })
      runTicks(game, 400)
      return digest(game.state)
    }
    expect(play()).toBe(play())
  })
})

describe('economy', () => {
  it('villagers gather wood and deliver it to the town center', () => {
    const game = new Game(99)
    const before = game.state.players[HUMAN].resources.wood
    const villagers = [...game.state.units.values()].filter((unit) => unit.owner === HUMAN)
    const node = [...game.state.nodes.values()]
      .filter((candidate) => candidate.kind === 'wood')
      .sort(
        (a, b) =>
          distance(villagers[0].x, villagers[0].y, a.tx, a.ty) -
          distance(villagers[0].x, villagers[0].y, b.tx, b.ty),
      )[0]
    game.queue.push({
      kind: 'gather',
      player: HUMAN,
      units: villagers.map((unit) => unit.id),
      nodeId: node!.id,
    })
    runTicks(game, 1200)
    expect(game.state.players[HUMAN].resources.wood).toBeGreaterThan(before)
  })
})

describe('victory conditions', () => {
  it('destroying the town center ends the match', () => {
    const game = new Game(7)
    const tc = [...game.state.buildings.values()].find(
      (building) => building.owner === ENEMY && building.type === 'townCenter',
    )
    tc!.hp = 0
    runTicks(game, 4)
    expect(game.state.status).toBe('over')
    expect(game.state.winner).toBe(HUMAN)
  })
})

describe('construction (§9.1)', () => {
  it('consumes resources at placement, completes, and raises the population cap', () => {
    const game = new Game(31337)
    const player = game.state.players[HUMAN]
    const woodBefore = player.resources.wood
    const capBefore = player.popCap
    const villagers = [...game.state.units.values()].filter((unit) => unit.owner === HUMAN)
    const tc = [...game.state.buildings.values()].find((b) => b.owner === HUMAN)!
    // Placement requires explored terrain, so let the first fog pass run.
    game.tick()

    let placed = false
    for (let r = 4; r < 12 && !placed; r++) {
      for (let a = 0; a < 12 && !placed; a++) {
        const tx = Math.round(tc.tx + Math.cos((a / 12) * Math.PI * 2) * r)
        const ty = Math.round(tc.ty + Math.sin((a / 12) * Math.PI * 2) * r)
        if (checkPlacement(game.state, player, 'house', tx, ty) !== 'ok') continue
        game.queue.push({
          kind: 'place',
          player: HUMAN,
          units: villagers.map((unit) => unit.id),
          building: 'house',
          tx,
          ty,
        })
        placed = true
      }
    }
    expect(placed).toBe(true)

    game.tick()
    expect(player.resources.wood).toBe(woodBefore - BUILDINGS.house.cost.wood!)

    runTicks(game, 1200)
    const house = [...game.state.buildings.values()].find((b) => b.type === 'house')
    expect(house?.complete).toBe(true)
    expect(player.popCap).toBe(capBefore + BUILDINGS.house.popProvided!)
  })
})

describe('combat (§12)', () => {
  it('applies the class bonus table and never deals less than one damage', () => {
    const spearman = { x: 0, y: 0, radius: 0.4, owner: 1, klass: 'infantry', armor: 1 }
    const cavalry = { ...spearman, klass: 'cavalry' }
    // Archers beat infantry; the same attack is far weaker against armour alone.
    expect(computeDamage('archer', 5, spearman)).toBe(Math.round(5 * 1.5) - 1)
    expect(computeDamage('infantry', 5, cavalry)).toBe(10 - 1)
    expect(computeDamage('villager', 1, { ...spearman, armor: 99 })).toBe(1)
  })
})

describe('ages (§11)', () => {
  it('advances to Feudal from the town center and unlocks its buildings', () => {
    const game = new Game(5150)
    const player = game.state.players[HUMAN]
    const tc = [...game.state.buildings.values()].find(
      (b) => b.owner === HUMAN && b.type === 'townCenter',
    )!
    expect(isUnlocked(player, 'feudal')).toBe(false)

    player.resources.food = 1000
    game.queue.push({ kind: 'advanceAge', player: HUMAN, buildingId: tc.id })
    runTicks(game, Math.round(AGES[1].researchTime * 20) + 5)

    expect(player.ageIndex).toBe(1)
    expect(isUnlocked(player, 'feudal')).toBe(true)
  })
})

describe('the AI opponent (§15)', () => {
  it('builds an economy, raises an army, and wins against a passive player', () => {
    const game = new Game(20260815)
    let peakArmy = 0
    let ticks = 0
    for (; ticks < 40_000 && game.state.status === 'playing'; ticks++) {
      game.tick()
      const army = [...game.state.units.values()].filter(
        (unit) => unit.owner === ENEMY && unit.type !== 'villager',
      ).length
      if (army > peakArmy) peakArmy = army
    }
    const ai = game.state.players[ENEMY]
    expect([...game.state.units.values()].filter((u) => u.owner === ENEMY).length).toBeGreaterThan(12)
    expect(peakArmy).toBeGreaterThanOrEqual(8)
    expect(game.state.status).toBe('over')
    expect(game.state.winner).toBe(ENEMY)
    // A 10-30 minute match at 20 Hz (§24.2); a passive opponent is the fast end.
    expect(ticks).toBeGreaterThan(20 * 60 * 5)
    expect(ticks).toBeLessThan(20 * 60 * 30)
    expect(ai.defeated).toBe(false)
  })
})

describe('serializability (§19.2 Rule 5)', () => {
  it('structuredClone round-trips the state and the clone keeps simulating', () => {
    const game = new Game(2024)
    runTicks(game, 100)
    const clone = structuredClone(game.state)
    const resumed = new Game(clone.seed, clone)
    runTicks(resumed, 100)
    runTicks(game, 100)
    expect(resumed.state.tick).toBe(game.state.tick)
    expect(resumed.state.units.size).toBe(game.state.units.size)
  })
})
