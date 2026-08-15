import Phaser from 'phaser'
import { unitDef } from '../simulation/GameState'
import { FOG_VISIBLE, HUMAN, type GameState, type Unit } from '../simulation/types'
import { COLORS, NODE_COLORS, PLAYER_COLORS, TILE } from './theme'

const RADIUS: Record<string, number> = { villager: 0.3, infantry: 0.34, archer: 0.32, cavalry: 0.4 }

export class UnitRenderer {
  private graphics: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(5)
  }

  /** `alpha` is the fraction of a tick elapsed — positions are interpolated. */
  draw(state: GameState, selected: Set<number>, alpha: number): void {
    const g = this.graphics
    g.clear()

    for (const unit of state.units.values()) {
      if (!this.visible(state, unit)) continue
      const def = unitDef(unit.type)
      const x = (unit.px + (unit.x - unit.px) * alpha) * TILE
      const y = (unit.py + (unit.y - unit.py) * alpha) * TILE
      const radius = (RADIUS[def.class] ?? 0.32) * TILE
      const color = PLAYER_COLORS[unit.owner] ?? 0xaaaaaa

      if (selected.has(unit.id)) {
        g.lineStyle(2, COLORS.selection, 0.95)
        g.strokeCircle(x, y, radius + 3)
      }

      g.fillStyle(0x000000, 0.25)
      g.fillEllipse(x, y + radius * 0.7, radius * 1.8, radius * 0.8)
      g.fillStyle(color, 1)
      g.fillCircle(x, y, radius)

      // Class marker: villagers plain, infantry a bar, archers a notch.
      if (def.class === 'infantry') {
        g.fillStyle(0x101510, 1)
        g.fillRect(x - 1, y - radius - 4, 2, radius + 4)
      } else if (def.class === 'archer') {
        g.lineStyle(2, 0x101510, 1)
        g.strokeCircle(x, y, radius * 0.45)
      }

      if (unit.carryAmount > 0 && unit.carryKind) {
        g.fillStyle(NODE_COLORS[unit.carryKind], 1)
        g.fillCircle(x + radius * 0.8, y - radius * 0.8, 3.5)
      }

      const maxHp = def.hp
      if (unit.hp < maxHp) {
        const width = radius * 2
        g.fillStyle(0x000000, 0.6)
        g.fillRect(x - radius, y - radius - 7, width, 3)
        g.fillStyle(unit.hp / maxHp > 0.4 ? COLORS.hpGood : COLORS.hpBad, 1)
        g.fillRect(x - radius, y - radius - 7, width * Math.max(0, unit.hp / maxHp), 3)
      }
    }
  }

  /** Enemy units disappear when they leave vision (§14). */
  private visible(state: GameState, unit: Unit): boolean {
    if (unit.owner === HUMAN) return true
    const tx = Math.floor(unit.x)
    const ty = Math.floor(unit.y)
    if (tx < 0 || ty < 0 || tx >= state.map.size || ty >= state.map.size) return false
    return state.fog[ty * state.map.size + tx] === FOG_VISIBLE
  }

  destroy(): void {
    this.graphics.destroy()
  }
}
