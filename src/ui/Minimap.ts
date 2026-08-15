import { NODE_COLORS, PLAYER_COLORS } from '../rendering/theme'
import { FOG_UNKNOWN, FOG_VISIBLE, HUMAN, TERRAIN_WATER, type GameState } from '../simulation/types'
import { el } from './dom'

const rgb = (value: number): [number, number, number] => [
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
]

/** Minimap with viewport rectangle and tap-to-jump (§16.2). */
export class Minimap {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private base: Uint8ClampedArray | null = null
  private frame: ImageData | null = null
  private pings: { x: number; y: number; until: number }[] = []

  constructor(
    parent: HTMLElement,
    private readonly onJump: (tx: number, ty: number) => void,
  ) {
    const wrapper = el('div', 'minimap clickable', parent)
    this.canvas = el('canvas', undefined, wrapper)
    this.context = this.canvas.getContext('2d') as CanvasRenderingContext2D
    wrapper.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      const rect = wrapper.getBoundingClientRect()
      const size = this.canvas.width
      this.onJump(
        ((event.clientX - rect.left) / rect.width) * size,
        ((event.clientY - rect.top) / rect.height) * size,
      )
    })
  }

  ping(x: number, y: number, now: number): void {
    this.pings.push({ x, y, until: now + 4000 })
  }

  private prepare(state: GameState): void {
    const size = state.map.size
    this.canvas.width = size
    this.canvas.height = size
    this.frame = this.context.createImageData(size, size)
    this.base = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < size * size; i++) {
      const water = state.map.terrain[i] === TERRAIN_WATER
      this.base[i * 4] = water ? 43 : 61
      this.base[i * 4 + 1] = water ? 93 : 107
      this.base[i * 4 + 2] = water ? 120 : 50
      this.base[i * 4 + 3] = 255
    }
  }

  /** One pass over a reused buffer, then a single putImageData. */
  refresh(state: GameState, view: { x: number; y: number; w: number; h: number }, now: number): void {
    if (!this.base || !this.frame) this.prepare(state)
    const size = state.map.size
    const data = this.frame!.data
    data.set(this.base!)

    const put = (tx: number, ty: number, color: [number, number, number]) => {
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) return
      const offset = (ty * size + tx) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
    }

    for (const node of state.nodes.values()) {
      if (state.fog[node.ty * size + node.tx] === FOG_UNKNOWN) continue
      put(node.tx, node.ty, rgb(NODE_COLORS[node.kind]))
    }
    for (const building of state.buildings.values()) {
      const i = building.ty * size + building.tx
      if (building.owner !== HUMAN && state.fog[i] === FOG_UNKNOWN) continue
      const color = rgb(PLAYER_COLORS[building.owner])
      for (let dy = 0; dy < building.size; dy++) {
        for (let dx = 0; dx < building.size; dx++) put(building.tx + dx, building.ty + dy, color)
      }
    }
    for (const unit of state.units.values()) {
      const tx = Math.floor(unit.x)
      const ty = Math.floor(unit.y)
      if (unit.owner !== HUMAN && state.fog[ty * size + tx] !== FOG_VISIBLE) continue
      const color = rgb(PLAYER_COLORS[unit.owner])
      put(tx, ty, color)
      put(tx + 1, ty, color)
    }

    // Unexplored ground stays dark on the minimap too.
    for (let i = 0; i < size * size; i++) {
      if (state.fog[i] !== FOG_UNKNOWN) continue
      data[i * 4] = 8
      data[i * 4 + 1] = 11
      data[i * 4 + 2] = 8
    }

    this.context.putImageData(this.frame!, 0, 0)

    this.pings = this.pings.filter((ping) => ping.until > now)
    for (const ping of this.pings) {
      this.context.strokeStyle = '#ff6b5a'
      this.context.lineWidth = 1
      this.context.beginPath()
      this.context.arc(ping.x, ping.y, 3 + ((now / 200) % 4), 0, Math.PI * 2)
      this.context.stroke()
    }

    this.context.strokeStyle = 'rgba(255,255,255,0.85)'
    this.context.lineWidth = 1
    this.context.strokeRect(view.x, view.y, view.w, view.h)
  }
}
