import Phaser from 'phaser'
import { HUMAN } from '../simulation/types'
import type { GameScene } from '../rendering/GameScene'
import { pickBuilding, pickUnit } from './Picking'
import { unitsInRect } from './Picking'

const DRAG_THRESHOLD = 12
const LONG_PRESS_MS = 480
const DOUBLE_TAP_MS = 320

type Mode = 'undecided' | 'pan' | 'box' | 'pinch' | 'done'

/**
 * Touch gesture resolution per §16.1. The v0.1 conflict — one-finger drag
 * meaning both pan and box-select — is resolved by what the drag starts on:
 * empty terrain pans, an owned unit box-selects.
 */
export class TouchController {
  private mode: Mode = 'undecided'
  private startX = 0
  private startY = 0
  private startWorld = { x: 0, y: 0 }
  private startScroll = { x: 0, y: 0 }
  private startedOnOwnUnit = false
  private longPressTimer = 0
  private pinchDistance = 0
  private pinchZoom = 1
  private lastTapTime = -1000
  private lastTapUnit = -1
  private pointers = new Map<number, Phaser.Input.Pointer>()

  constructor(private readonly scene: GameScene) {}

  attach(): void {
    const input = this.scene.input
    input.addPointer(2)
    input.on('pointerdown', this.onDown, this)
    input.on('pointermove', this.onMove, this)
    input.on('pointerup', this.onUp, this)
    input.on('pointerupoutside', this.onUp, this)
  }

  detach(): void {
    const input = this.scene.input
    input.off('pointerdown', this.onDown, this)
    input.off('pointermove', this.onMove, this)
    input.off('pointerup', this.onUp, this)
    input.off('pointerupoutside', this.onUp, this)
  }

  private isTouch(pointer: Phaser.Input.Pointer): boolean {
    return pointer.wasTouch
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouch(pointer)) return
    this.pointers.set(pointer.id, pointer)

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinchDistance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
      this.pinchZoom = this.scene.cameras.main.zoom
      this.mode = 'pinch'
      this.scene.setBoxSelect(null)
      return
    }
    if (this.pointers.size > 2) return

    const camera = this.scene.cameras.main
    this.startX = pointer.x
    this.startY = pointer.y
    this.startWorld = this.scene.toWorldTile(pointer.x, pointer.y)
    this.startScroll = { x: camera.scrollX, y: camera.scrollY }
    this.mode = 'undecided'
    this.startedOnOwnUnit =
      pickUnit(this.scene.sim.state, this.startWorld.x, this.startWorld.y, this.scene.pickRadius(), HUMAN) !==
      null
    this.longPressTimer = window.setTimeout(() => {
      if (this.mode !== 'undecided') return
      this.mode = 'done'
      this.scene.openContextMenu(pointer.x, pointer.y, this.startWorld.x, this.startWorld.y)
    }, LONG_PRESS_MS)
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouch(pointer) || !this.pointers.has(pointer.id)) return
    this.pointers.set(pointer.id, pointer)
    const camera = this.scene.cameras.main

    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) return
      const [a, b] = [...this.pointers.values()]
      const distance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
      if (this.pinchDistance > 0) this.scene.setZoom(this.pinchZoom * (distance / this.pinchDistance))
      return
    }

    const dx = pointer.x - this.startX
    const dy = pointer.y - this.startY
    if (this.mode === 'undecided') {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      window.clearTimeout(this.longPressTimer)
      this.mode = this.startedOnOwnUnit ? 'box' : 'pan'
    }

    if (this.mode === 'pan') {
      camera.setScroll(this.startScroll.x - dx / camera.zoom, this.startScroll.y - dy / camera.zoom)
    } else if (this.mode === 'box') {
      const current = this.scene.toWorldTile(pointer.x, pointer.y)
      this.scene.setBoxSelect({ x0: this.startWorld.x, y0: this.startWorld.y, x1: current.x, y1: current.y })
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouch(pointer)) return
    this.pointers.delete(pointer.id)
    window.clearTimeout(this.longPressTimer)

    if (this.mode === 'pinch') {
      if (this.pointers.size === 0) this.mode = 'done'
      return
    }
    if (this.mode === 'box') {
      const end = this.scene.toWorldTile(pointer.x, pointer.y)
      const found = unitsInRect(
        this.scene.sim.state,
        this.startWorld.x,
        this.startWorld.y,
        end.x,
        end.y,
        HUMAN,
      )
      if (found.length > 0) this.scene.selection.setUnits(found.map((unit) => unit.id))
      this.scene.setBoxSelect(null)
      this.scene.refreshUI()
    } else if (this.mode === 'undecided') {
      this.tap(this.startWorld.x, this.startWorld.y)
    }
    this.mode = this.pointers.size > 0 ? 'done' : 'undecided'
  }

  private tap(x: number, y: number): void {
    const scene = this.scene
    if (scene.pendingBuild) {
      scene.confirmPlacement(x, y)
      return
    }
    const state = scene.sim.state
    const own = pickUnit(state, x, y, scene.pickRadius(), HUMAN)
    if (own) {
      const now = scene.time.now
      if (now - this.lastTapTime < DOUBLE_TAP_MS && this.lastTapUnit === own.id) {
        scene.selectSameTypeOnScreen(own.type)
      } else {
        scene.selection.setUnits([own.id])
      }
      this.lastTapTime = now
      this.lastTapUnit = own.id
      scene.refreshUI()
      return
    }
    const building = pickBuilding(state, x, y)
    if (building && building.owner === HUMAN && scene.selection.villagers(state).length === 0) {
      scene.selection.setBuilding(building.id)
      scene.refreshUI()
      return
    }
    if (!scene.selection.isEmpty) {
      scene.emitter.context(x, y, scene.pickRadius())
      scene.flashMarker(x, y)
      return
    }
    if (building) {
      scene.selection.setBuilding(building.id)
    } else {
      scene.selection.clear()
    }
    scene.refreshUI()
  }
}
