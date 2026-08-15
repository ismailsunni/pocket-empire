import Phaser from 'phaser'
import type { GameState } from '../simulation/types'
import { TERRAIN_WATER } from '../simulation/types'
import { COLORS, NODE_COLORS, TILE } from './theme'

const MARGIN = 2
/** Terrain is flat per tile, so a small texture upscaled with NEAREST is pixel-identical. */
const TERRAIN_PX = 8

/**
 * Terrain is baked once into a render texture and drawn as a single quad.
 * Resource nodes stay a Graphics but are view-culled and only redrawn when the
 * visible window or the node set changes — a Phaser Graphics replays its whole
 * command list every frame, so drawing all 96x96 tiles per frame would cost ~9k
 * draw commands on a device that has none to spare.
 */
export class MapRenderer {
  private terrain: Phaser.GameObjects.RenderTexture
  private nodes: Phaser.GameObjects.Graphics
  private window = { minX: -1, minY: -1, maxX: -1, maxY: -1 }
  private nodeCount = -1

  constructor(scene: Phaser.Scene, state: GameState) {
    const size = state.map.size
    this.terrain = scene.add
      .renderTexture(0, 0, size * TERRAIN_PX, size * TERRAIN_PX)
      .setOrigin(0)
      .setScale(TILE / TERRAIN_PX)
      .setDepth(0)
    this.terrain.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
    this.bakeTerrain(scene, state)
    this.nodes = scene.add.graphics().setDepth(1)
  }

  private bakeTerrain(scene: Phaser.Scene, state: GameState): void {
    const size = state.map.size
    const brush = scene.make.graphics({ x: 0, y: 0 }, false)
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const i = ty * size + tx
        const water = state.map.terrain[i] === TERRAIN_WATER
        // Deterministic tint variation so flat colour does not read as a void.
        const color = water ? COLORS.water : COLORS.grass[(tx * 7 + ty * 13) % COLORS.grass.length]
        brush.fillStyle(color, 1)
        brush.fillRect(tx * TERRAIN_PX, ty * TERRAIN_PX, TERRAIN_PX, TERRAIN_PX)
      }
    }
    this.terrain.draw(brush)
    brush.destroy()
  }

  update(state: GameState, view: { x: number; y: number; w: number; h: number }): void {
    const size = state.map.size
    const minX = Math.max(0, Math.floor(view.x) - MARGIN)
    const minY = Math.max(0, Math.floor(view.y) - MARGIN)
    const maxX = Math.min(size - 1, Math.ceil(view.x + view.w) + MARGIN)
    const maxY = Math.min(size - 1, Math.ceil(view.y + view.h) + MARGIN)

    if (
      minX === this.window.minX &&
      minY === this.window.minY &&
      maxX === this.window.maxX &&
      maxY === this.window.maxY &&
      state.nodes.size === this.nodeCount
    ) {
      return
    }
    this.window = { minX, minY, maxX, maxY }
    this.nodeCount = state.nodes.size

    const g = this.nodes
    g.clear()
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const id = state.map.nodeAt[ty * size + tx]
        if (id === -1) continue
        const node = state.nodes.get(id)
        if (!node) continue
        g.fillStyle(NODE_COLORS[node.kind], 1)
        if (node.kind === 'wood') g.fillCircle(tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE * 0.42)
        else g.fillRoundedRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8, 5)
      }
    }
  }

  destroy(): void {
    this.terrain.destroy()
    this.nodes.destroy()
  }
}
