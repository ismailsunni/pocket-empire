import Phaser from 'phaser'
import { FOG_EXPLORED, FOG_UNKNOWN, type GameState } from '../simulation/types'
import { TILE } from './theme'

/**
 * Fog is drawn as a one-pixel-per-tile texture stretched over the world, so the
 * cost is a 96x96 buffer write rather than thousands of quads (§14).
 */
export class FogRenderer {
  private texture: Phaser.Textures.CanvasTexture
  private image: Phaser.GameObjects.Image
  private buffer: ImageData

  constructor(scene: Phaser.Scene, state: GameState) {
    const size = state.map.size
    this.texture = scene.textures.createCanvas('fog', size, size) as Phaser.Textures.CanvasTexture
    this.buffer = this.texture.context.createImageData(size, size)
    this.image = scene.add
      .image(0, 0, 'fog')
      .setOrigin(0)
      .setDisplaySize(size * TILE, size * TILE)
      .setDepth(8)
    this.image.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
  }

  update(state: GameState): void {
    const data = this.buffer.data
    for (let i = 0; i < state.fog.length; i++) {
      const value = state.fog[i]
      const offset = i * 4
      data[offset] = 5
      data[offset + 1] = 8
      data[offset + 2] = 10
      data[offset + 3] = value === FOG_UNKNOWN ? 255 : value === FOG_EXPLORED ? 110 : 0
    }
    this.texture.context.putImageData(this.buffer, 0, 0)
    this.texture.refresh()
  }

  destroy(): void {
    this.image.destroy()
    this.texture.destroy()
  }
}
