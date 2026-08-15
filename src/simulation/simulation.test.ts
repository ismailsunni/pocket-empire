import { describe, expect, it } from 'vitest'
import { generateMap } from '../map/MapGenerator'
import { isWalkable, NEIGHBORS, idx } from '../map/Tile'
import { Game } from './Game'
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
