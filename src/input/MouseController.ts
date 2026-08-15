import Phaser from 'phaser'
import type { GameScene } from '../rendering/GameScene'
import { HUMAN } from '../simulation/types'
import { pickBuilding, pickUnit, unitsInRect } from './Picking'
import { allMilitary } from './Selection'

const DRAG_THRESHOLD = 6
const EDGE_MARGIN = 24
const EDGE_SPEED = 14
const KEY_SPEED = 16

/**
 * Desktop adapter (§16.3). Same commands, same queue — there is one game
 * implementation, two input adapters.
 */
export class MouseController {
  private dragging = false
  private downX = 0
  private downY = 0
  private start = { x: 0, y: 0 }
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor(private readonly scene: GameScene) {}

  attach(): void {
    const input = this.scene.input
    input.mouse?.disableContextMenu()
    input.on('pointerdown', this.onDown, this)
    input.on('pointermove', this.onMove, this)
    input.on('pointerup', this.onUp, this)
    input.on('wheel', this.onWheel, this)

    const keyboard = this.scene.input.keyboard
    if (!keyboard) return
    this.keys = keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,B,H,PERIOD,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    keyboard.on('keydown', this.onKey, this)
  }

  detach(): void {
    const input = this.scene.input
    input.off('pointerdown', this.onDown, this)
    input.off('pointermove', this.onMove, this)
    input.off('pointerup', this.onUp, this)
    input.off('wheel', this.onWheel, this)
    this.scene.input.keyboard?.off('keydown', this.onKey, this)
  }

  private isMouse(pointer: Phaser.Input.Pointer): boolean {
    return !pointer.wasTouch
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isMouse(pointer)) return
    const world = this.scene.toWorldTile(pointer.x, pointer.y)

    if (pointer.rightButtonDown()) {
      if (this.scene.pendingBuild) {
        this.scene.cancelPlacement()
        return
      }
      this.scene.emitter.context(world.x, world.y, this.scene.pickRadius())
      this.scene.flashMarker(world.x, world.y)
      return
    }

    if (this.scene.pendingBuild) {
      this.scene.confirmPlacement(world.x, world.y)
      return
    }
    this.dragging = true
    this.downX = pointer.x
    this.downY = pointer.y
    this.start = world
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isMouse(pointer) || !this.dragging) return
    if (Math.hypot(pointer.x - this.downX, pointer.y - this.downY) < DRAG_THRESHOLD) return
    const current = this.scene.toWorldTile(pointer.x, pointer.y)
    this.scene.setBoxSelect({ x0: this.start.x, y0: this.start.y, x1: current.x, y1: current.y })
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isMouse(pointer) || !this.dragging) return
    this.dragging = false
    const scene = this.scene
    const world = scene.toWorldTile(pointer.x, pointer.y)
    const dragged = Math.hypot(pointer.x - this.downX, pointer.y - this.downY) >= DRAG_THRESHOLD
    scene.setBoxSelect(null)

    if (dragged) {
      const found = unitsInRect(scene.sim.state, this.start.x, this.start.y, world.x, world.y, HUMAN)
      if (found.length > 0) scene.selection.setUnits(found.map((unit) => unit.id))
      else scene.selection.clear()
      scene.refreshUI()
      return
    }

    const state = scene.sim.state
    const unit = pickUnit(state, world.x, world.y, scene.pickRadius(), HUMAN)
    if (unit) {
      scene.selection.setUnits([unit.id])
      scene.refreshUI()
      return
    }
    const building = pickBuilding(state, world.x, world.y)
    if (building) scene.selection.setBuilding(building.id)
    else scene.selection.clear()
    scene.refreshUI()
  }

  private onWheel(_pointer: unknown, _objects: unknown, _dx: number, dy: number): void {
    this.scene.setZoom(this.scene.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1))
  }

  private onKey(event: KeyboardEvent): void {
    const scene = this.scene
    if (event.key >= '0' && event.key <= '9') {
      const slot = Number(event.key)
      if (event.ctrlKey || event.shiftKey) scene.selection.assignGroup(slot)
      else if (scene.selection.recallGroup(slot, scene.sim.state)) scene.centerOnSelection()
      scene.refreshUI()
      return
    }
    switch (event.key.toLowerCase()) {
      case 's':
        if (!event.ctrlKey) scene.emitter.stop()
        break
      case 'h':
        scene.jumpToTownCenter()
        break
      case 'b':
        scene.toggleBuildMenu()
        break
      case '.':
        scene.cycleIdleVillager()
        break
      case 'a':
        if (event.shiftKey) {
          scene.selection.setUnits(allMilitary(scene.sim.state))
          scene.refreshUI()
        }
        break
      case 'escape':
        scene.cancelPlacement()
        scene.selection.clear()
        scene.refreshUI()
        break
    }
  }

  /** Camera keys and edge scrolling, applied every frame. */
  update(delta: number): void {
    const camera = this.scene.cameras.main
    if (!this.keys) return
    const step = (KEY_SPEED * delta) / 16 / camera.zoom
    let dx = 0
    let dy = 0
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) dx -= step
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) dx += step
    if (this.keys.W?.isDown || this.keys.UP?.isDown) dy -= step
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) dy += step

    const pointer = this.scene.input.activePointer
    if (!pointer.wasTouch && this.scene.edgeScrollEnabled) {
      const width = this.scene.scale.width
      const height = this.scene.scale.height
      const edge = (EDGE_SPEED * delta) / 16 / camera.zoom
      if (pointer.x < EDGE_MARGIN) dx -= edge
      else if (pointer.x > width - EDGE_MARGIN) dx += edge
      if (pointer.y < EDGE_MARGIN) dy -= edge
      else if (pointer.y > height - EDGE_MARGIN) dy += edge
    }

    if (dx !== 0 || dy !== 0) camera.setScroll(camera.scrollX + dx, camera.scrollY + dy)
  }
}
