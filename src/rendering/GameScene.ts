import Phaser from 'phaser'
import { CommandEmitter } from '../input/CommandEmitter'
import { MouseController } from '../input/MouseController'
import { pickBuilding } from '../input/Picking'
import { Selection, allMilitary, idleVillagers } from '../input/Selection'
import { TouchController } from '../input/TouchController'
import { checkPlacement } from '../simulation/Construction'
import { Game } from '../simulation/Game'
import { buildingDef } from '../simulation/GameState'
import { HUMAN, type GameState } from '../simulation/types'
import type { Hud } from '../ui/Hud'
import { BuildingRenderer } from './BuildingRenderer'
import { FogRenderer } from './FogRenderer'
import { MapRenderer } from './MapRenderer'
import { COLORS, TILE } from './theme'
import { UnitRenderer } from './UnitRenderer'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.2
const FOG_REFRESH_MS = 200
/** Minimum touch target of 44px, converted to world tiles at the current zoom. */
const TOUCH_TARGET_PX = 44

export interface BoxSelect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export class GameScene extends Phaser.Scene {
  sim!: Game
  selection = new Selection()
  emitter!: CommandEmitter
  hud!: Hud
  pendingBuild: string | null = null
  edgeScrollEnabled = true
  paused = false

  private mapRenderer!: MapRenderer
  private unitRenderer!: UnitRenderer
  private buildingRenderer!: BuildingRenderer
  private fogRenderer!: FogRenderer
  private overlay!: Phaser.GameObjects.Graphics
  private touch!: TouchController
  private mouse!: MouseController
  private box: BoxSelect | null = null
  private marker: { x: number; y: number; until: number } | null = null
  private lastFogUpdate = 0
  private idleCycle = 0
  private seed = 0
  private restored: GameState | undefined
  private reportedGameOver = false

  constructor() {
    // Not auto-started: main.ts starts the scene with a seed and the HUD.
    super({ key: 'game', active: false })
  }

  init(data: { seed: number; hud: Hud; state?: GameState }): void {
    this.seed = data.seed
    this.hud = data.hud
    this.restored = data.state
    this.reportedGameOver = false
  }

  create(): void {
    this.sim = new Game(this.seed, this.restored)
    this.selection = new Selection()
    this.emitter = new CommandEmitter(this.sim, this.selection)

    const worldSize = this.sim.state.map.size * TILE
    this.cameras.main.setBounds(0, 0, worldSize, worldSize)
    this.cameras.main.setBackgroundColor(0x0d120d)

    this.mapRenderer = new MapRenderer(this, this.sim.state)
    this.buildingRenderer = new BuildingRenderer(this)
    this.unitRenderer = new UnitRenderer(this)
    this.fogRenderer = new FogRenderer(this, this.sim.state)
    this.overlay = this.add.graphics().setDepth(10)

    this.touch = new TouchController(this)
    this.mouse = new MouseController(this)
    this.touch.attach()
    this.mouse.attach()

    this.jumpToTownCenter()
    this.setZoom(1)
    this.events.once('shutdown', () => this.teardown())
  }

  private teardown(): void {
    this.touch.detach()
    this.mouse.detach()
    this.mapRenderer.destroy()
    this.unitRenderer.destroy()
    this.buildingRenderer.destroy()
    this.fogRenderer.destroy()
  }

  override update(time: number, delta: number): void {
    if (!this.sim || !this.hud) return
    if (!this.paused) this.sim.update(delta / 1000)
    this.mouse.update(delta)

    const view = this.viewRect()
    this.selection.prune(this.sim.state)
    this.mapRenderer.update(this.sim.state, view)
    this.buildingRenderer.draw(this.sim.state, this.selectedBuildings())
    this.unitRenderer.draw(this.sim.state, this.selection.units, this.paused ? 1 : this.sim.alpha)
    if (time - this.lastFogUpdate > FOG_REFRESH_MS) {
      this.lastFogUpdate = time
      this.fogRenderer.update(this.sim.state)
    }
    this.drawOverlay(time)

    this.hud.consumeEvents(this.sim.state, time)
    this.hud.refresh(this.sim.state, this.selection, view, time)

    if (this.sim.state.status === 'over' && !this.reportedGameOver) {
      this.reportedGameOver = true
      this.events.emit('gameover', this.sim.state.winner)
    }
  }

  private selectedBuildings(): Set<number> {
    return this.selection.buildingId === null ? new Set() : new Set([this.selection.buildingId])
  }

  /** Box-select rectangle, ghost placement preview, and the command marker. */
  private drawOverlay(time: number): void {
    const g = this.overlay
    g.clear()

    if (this.box) {
      const x = Math.min(this.box.x0, this.box.x1) * TILE
      const y = Math.min(this.box.y0, this.box.y1) * TILE
      const w = Math.abs(this.box.x1 - this.box.x0) * TILE
      const h = Math.abs(this.box.y1 - this.box.y0) * TILE
      g.fillStyle(COLORS.selection, 0.12)
      g.fillRect(x, y, w, h)
      g.lineStyle(1.5, COLORS.selection, 0.9)
      g.strokeRect(x, y, w, h)
    }

    if (this.pendingBuild) {
      const pointer = this.input.activePointer
      const world = this.toWorldTile(pointer.x, pointer.y)
      const def = buildingDef(this.pendingBuild)
      const tx = Math.floor(world.x - def.size / 2)
      const ty = Math.floor(world.y - def.size / 2)
      const ok =
        checkPlacement(this.sim.state, this.sim.state.players[HUMAN], this.pendingBuild, tx, ty) === 'ok'
      g.fillStyle(ok ? COLORS.ghostValid : COLORS.ghostInvalid, 0.35)
      g.fillRect(tx * TILE, ty * TILE, def.size * TILE, def.size * TILE)
      g.lineStyle(2, ok ? COLORS.ghostValid : COLORS.ghostInvalid, 0.9)
      g.strokeRect(tx * TILE, ty * TILE, def.size * TILE, def.size * TILE)
    }

    if (this.marker && this.marker.until > time) {
      const age = 1 - (this.marker.until - time) / 500
      g.lineStyle(2, COLORS.selection, 1 - age)
      g.strokeCircle(this.marker.x * TILE, this.marker.y * TILE, 6 + age * 14)
    }
  }

  // --- helpers used by the input adapters ---------------------------------

  toWorldTile(screenX: number, screenY: number): { x: number; y: number } {
    const point = this.cameras.main.getWorldPoint(screenX, screenY)
    return { x: point.x / TILE, y: point.y / TILE }
  }

  pickRadius(): number {
    return TOUCH_TARGET_PX / 2 / this.cameras.main.zoom / TILE
  }

  setZoom(zoom: number): void {
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM))
  }

  setBoxSelect(box: BoxSelect | null): void {
    this.box = box
  }

  flashMarker(x: number, y: number): void {
    this.marker = { x, y, until: this.time.now + 500 }
  }

  refreshUI(): void {
    this.hud.refresh(this.sim.state, this.selection, this.viewRect(), this.time.now, true)
  }

  viewRect(): { x: number; y: number; w: number; h: number } {
    const view = this.cameras.main.worldView
    return { x: view.x / TILE, y: view.y / TILE, w: view.width / TILE, h: view.height / TILE }
  }

  centerOn(tileX: number, tileY: number): void {
    this.cameras.main.centerOn(tileX * TILE, tileY * TILE)
  }

  centerOnSelection(): void {
    const ids = this.selection.ids()
    if (ids.length === 0) return
    let x = 0
    let y = 0
    let count = 0
    for (const id of ids) {
      const unit = this.sim.state.units.get(id)
      if (!unit) continue
      x += unit.x
      y += unit.y
      count++
    }
    if (count > 0) this.centerOn(x / count, y / count)
  }

  jumpToTownCenter(): void {
    for (const building of this.sim.state.buildings.values()) {
      if (building.owner !== HUMAN || building.type !== 'townCenter') continue
      this.centerOn(building.tx + building.size / 2, building.ty + building.size / 2)
      return
    }
  }

  cycleIdleVillager(): void {
    const idle = idleVillagers(this.sim.state)
    if (idle.length === 0) return
    this.idleCycle = (this.idleCycle + 1) % idle.length
    const unit = this.sim.state.units.get(idle[this.idleCycle])
    if (!unit) return
    this.selection.setUnits([unit.id])
    this.centerOn(unit.x, unit.y)
    this.refreshUI()
  }

  selectAllMilitary(): void {
    const ids = allMilitary(this.sim.state)
    if (ids.length === 0) return
    this.selection.setUnits(ids)
    this.centerOnSelection()
    this.refreshUI()
  }

  /** Double-tap behaviour: every unit of that type currently on screen (§16.1). */
  selectSameTypeOnScreen(type: string): void {
    const view = this.viewRect()
    const ids: number[] = []
    for (const unit of this.sim.state.units.values()) {
      if (unit.owner !== HUMAN || unit.type !== type) continue
      if (unit.x < view.x || unit.y < view.y || unit.x > view.x + view.w || unit.y > view.y + view.h) {
        continue
      }
      ids.push(unit.id)
    }
    if (ids.length > 0) this.selection.setUnits(ids)
  }

  startPlacement(type: string): void {
    this.pendingBuild = type
  }

  cancelPlacement(): void {
    this.pendingBuild = null
    this.hud.panel.buildMenu.close()
    this.refreshUI()
  }

  confirmPlacement(x: number, y: number): void {
    if (!this.pendingBuild) return
    const def = buildingDef(this.pendingBuild)
    const tx = Math.floor(x - def.size / 2)
    const ty = Math.floor(y - def.size / 2)
    const result = checkPlacement(this.sim.state, this.sim.state.players[HUMAN], this.pendingBuild, tx, ty)
    if (result !== 'ok') {
      this.hud.notify(
        result === 'poor'
          ? 'Not enough resources'
          : result === 'unexplored'
            ? 'Scout this area first'
            : 'Cannot build there',
        this.time.now,
      )
      return
    }
    this.emitter.place(this.pendingBuild, tx, ty)
    this.cancelPlacement()
  }

  toggleBuildMenu(): void {
    if (this.selection.villagers(this.sim.state).length === 0) {
      const villagers = idleVillagers(this.sim.state)
      if (villagers.length > 0) this.selection.setUnits([villagers[0]])
    }
    this.hud.panel.buildMenu.toggle()
    this.refreshUI()
  }

  /** Long-press fallback for gestures the contextual rules cannot disambiguate (§16.1). */
  openContextMenu(screenX: number, screenY: number, worldX: number, worldY: number): void {
    const options: { label: string; action: () => void }[] = []
    const ids = this.selection.ids()
    if (ids.length > 0) {
      options.push({ label: 'Move here', action: () => this.emitter.move(ids, worldX, worldY) })
      if (this.selection.military(this.sim.state).length > 0) {
        options.push({
          label: 'Attack-move',
          action: () => this.emitter.attackMove(this.selection.military(this.sim.state), worldX, worldY),
        })
      }
      options.push({ label: 'Stop', action: () => this.emitter.stop() })
    }
    const building = pickBuilding(this.sim.state, worldX, worldY)
    if (this.selection.buildingId !== null) {
      options.push({
        label: 'Set rally point',
        action: () => this.emitter.setRally(this.selection.buildingId!, worldX, worldY),
      })
    } else if (building && building.owner === HUMAN) {
      options.push({
        label: 'Select building',
        action: () => {
          this.selection.setBuilding(building.id)
          this.refreshUI()
        },
      })
    }
    options.push({ label: 'Cancel', action: () => this.hud.hideContextMenu() })
    this.hud.showContextMenu(screenX, screenY, options)
  }

  get state(): GameState {
    return this.sim.state
  }
}
