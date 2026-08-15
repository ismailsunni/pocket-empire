import { AGES } from '../data'
import type { Selection } from '../input/Selection'
import { idleVillagers } from '../input/Selection'
import type { GameEvent, GameState } from '../simulation/types'
import { HUMAN } from '../simulation/types'
import { Minimap } from './Minimap'
import { ResourceBar } from './ResourceBar'
import { SelectionPanel, type SelectionHandlers } from './SelectionPanel'
import { el } from './dom'

export interface HudHandlers extends SelectionHandlers {
  onIdleVillager: () => void
  onSelectMilitary: () => void
  onJumpTownCenter: () => void
  onMinimapJump: (tx: number, ty: number) => void
  onPause: () => void
}

const REFRESH_MS = 120

const MESSAGES: Partial<Record<GameEvent['kind'], string>> = {
  popCapped: 'Population capped — build a House',
  insufficientResources: 'Not enough resources',
  underAttack: 'Under attack!',
}

export class Hud {
  private readonly bar: ResourceBar
  readonly panel: SelectionPanel
  private readonly minimap: Minimap
  private readonly notifications: HTMLElement
  private readonly idleButton: HTMLButtonElement
  private readonly contextMenu: HTMLElement
  private lastNotification = ''
  private lastNotificationAt = -1e9
  private lastRefresh = -1e9

  constructor(
    private readonly root: HTMLElement,
    handlers: HudHandlers,
  ) {
    this.bar = new ResourceBar(root, handlers.onPause)

    const sidebar = el('div', 'sidebar', root)
    this.idleButton = el('button', 'clickable', sidebar)
    this.idleButton.addEventListener('click', handlers.onIdleVillager)
    const army = el('button', 'clickable', sidebar)
    army.textContent = 'Army'
    army.addEventListener('click', handlers.onSelectMilitary)
    const home = el('button', 'clickable', sidebar)
    home.textContent = 'Town'
    home.addEventListener('click', handlers.onJumpTownCenter)

    this.notifications = el('div', 'notifications', root)
    this.panel = new SelectionPanel(root, handlers)
    this.minimap = new Minimap(root, handlers.onMinimapJump)

    this.contextMenu = el('div', 'selection clickable', root)
    this.contextMenu.hidden = true
    this.contextMenu.style.bottom = 'auto'
    this.contextMenu.style.left = 'auto'
    this.contextMenu.style.right = 'auto'
    this.contextMenu.style.position = 'absolute'
    this.contextMenu.style.borderRadius = '10px'
    this.contextMenu.style.width = 'max-content'
  }

  /**
   * Throttled: the panel rebuilds DOM and the minimap repaints, neither of
   * which is worth doing at display rate.
   */
  refresh(
    state: GameState,
    selection: Selection,
    view: { x: number; y: number; w: number; h: number },
    now: number,
    force = false,
  ): void {
    if (!force && now - this.lastRefresh < REFRESH_MS) return
    this.lastRefresh = now
    this.bar.refresh(state.players[HUMAN])
    this.panel.refresh(state, selection, HUMAN)
    this.minimap.refresh(state, view, now)
    const idle = idleVillagers(state).length
    this.idleButton.innerHTML = `Idle<span class="badge">${idle}</span>`
    this.idleButton.disabled = idle === 0
  }

  consumeEvents(state: GameState, now: number): void {
    for (const event of state.events) {
      if (event.kind === 'ageAdvanced' && event.player === HUMAN) {
        this.notify(`Advanced to ${AGES.find((age) => age.id === event.age)?.name}`, now)
      } else if (event.kind === 'underAttack') {
        this.notify(MESSAGES.underAttack!, now)
        this.minimap.ping(event.x, event.y, now)
      } else {
        const message = MESSAGES[event.kind]
        if (message) this.notify(message, now)
      }
    }
    state.events.length = 0
  }

  /** Same message twice in a row is noise, not information. */
  notify(message: string, now: number): void {
    if (message === this.lastNotification && now - this.lastNotificationAt < 3000) return
    this.lastNotification = message
    this.lastNotificationAt = now
    const node = el('div', undefined, this.notifications)
    node.textContent = message
    window.setTimeout(() => node.remove(), 4000)
  }

  showContextMenu(x: number, y: number, options: { label: string; action: () => void }[]): void {
    this.contextMenu.innerHTML = ''
    const actions = el('div', 'actions', this.contextMenu)
    for (const option of options) {
      const node = el('button', undefined, actions)
      node.textContent = option.label
      node.addEventListener('click', () => {
        option.action()
        this.hideContextMenu()
      })
    }
    this.contextMenu.hidden = false
    const width = this.contextMenu.offsetWidth
    this.contextMenu.style.left = `${Math.min(Math.max(8, x - width / 2), this.root.clientWidth - width - 8)}px`
    this.contextMenu.style.top = `${Math.max(48, y - 70)}px`
  }

  hideContextMenu(): void {
    this.contextMenu.hidden = true
  }

  get contextMenuOpen(): boolean {
    return !this.contextMenu.hidden
  }
}
