import Phaser from 'phaser'
import { buildingDef } from '../simulation/GameState'
import { FOG_UNKNOWN, HUMAN, type Building, type GameState } from '../simulation/types'
import { COLORS, PLAYER_COLORS, TILE } from './theme'

const LABELS: Record<string, string> = {
  townCenter: 'TC',
  house: 'H',
  barracks: 'B',
  archeryRange: 'A',
  farm: 'F',
  tower: 'T',
}

export class BuildingRenderer {
  private graphics: Phaser.GameObjects.Graphics
  private labels: Phaser.GameObjects.Text[] = []
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.graphics = scene.add.graphics().setDepth(2)
  }

  draw(state: GameState, selected: Set<number>): void {
    const g = this.graphics
    g.clear()
    let labelIndex = 0

    for (const building of state.buildings.values()) {
      if (!this.remembered(state, building)) continue
      const x = building.tx * TILE
      const y = building.ty * TILE
      const size = building.size * TILE
      const color = PLAYER_COLORS[building.owner] ?? 0xaaaaaa

      g.fillStyle(building.complete ? color : 0x000000, building.complete ? 0.85 : 0.35)
      g.fillRect(x + 2, y + 2, size - 4, size - 4)
      g.lineStyle(2, color, 1)
      g.strokeRect(x + 2, y + 2, size - 4, size - 4)

      if (!building.complete) {
        const def = buildingDef(building.type)
        const progress = building.buildProgress / (def.buildTime * 20)
        g.fillStyle(color, 0.5)
        g.fillRect(x + 2, y + size - 2 - (size - 4) * progress, size - 4, (size - 4) * progress)
      }

      if (selected.has(building.id)) {
        g.lineStyle(2, COLORS.selection, 1)
        g.strokeRect(x - 1, y - 1, size + 2, size + 2)
      }

      if (building.hp < building.maxHp) {
        this.healthBar(g, x + 3, y - 5, size - 6, building.hp / building.maxHp)
      }

      const label = this.label(labelIndex++)
      label.setText(LABELS[building.type] ?? '?')
      label.setPosition(x + size / 2, y + size / 2)
      label.setVisible(true)
    }

    for (let i = labelIndex; i < this.labels.length; i++) this.labels[i].setVisible(false)
  }

  /** Static objects stay drawn from memory once explored (§14). */
  private remembered(state: GameState, building: Building): boolean {
    if (building.owner === HUMAN) return true
    const i = (building.ty + (building.size >> 1)) * state.map.size + building.tx + (building.size >> 1)
    return state.fog[i] !== FOG_UNKNOWN
  }

  private healthBar(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, ratio: number): void {
    g.fillStyle(0x000000, 0.6)
    g.fillRect(x, y, width, 4)
    g.fillStyle(ratio > 0.4 ? COLORS.hpGood : COLORS.hpBad, 1)
    g.fillRect(x, y, width * ratio, 4)
  }

  private label(index: number): Phaser.GameObjects.Text {
    let text = this.labels[index]
    if (!text) {
      text = this.scene.add
        .text(0, 0, '', { fontSize: '13px', color: '#0d120d', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(3)
      this.labels[index] = text
    }
    return text
  }

  destroy(): void {
    this.graphics.destroy()
    for (const label of this.labels) label.destroy()
  }
}
