import { BUILDINGS, RESOURCE_KINDS, type Cost } from '../data'
import { RESOURCE_ICONS } from '../rendering/theme'
import { canAfford, isUnlocked } from '../simulation/GameState'
import type { Player } from '../simulation/types'
import { button, el } from './dom'

export const formatCost = (cost: Cost): string =>
  RESOURCE_KINDS.filter((kind) => cost[kind])
    .map((kind) => `${RESOURCE_ICONS[kind]}${cost[kind]}`)
    .join(' ')

/** Buildings available in the player's current age, with live affordability. */
export class BuildMenu {
  private readonly root: HTMLElement
  open = false

  constructor(
    parent: HTMLElement,
    private readonly onPick: (type: string) => void,
  ) {
    this.root = el('div', 'actions', parent)
  }

  toggle(): void {
    this.open = !this.open
  }

  close(): void {
    this.open = false
  }

  refresh(player: Player): void {
    this.root.innerHTML = ''
    if (!this.open) return
    for (const [type, def] of Object.entries(BUILDINGS)) {
      if (!isUnlocked(player, def.age)) continue
      const node = button(
        `${def.name}<span class="cost">${formatCost(def.cost)}</span>`,
        this.root,
        () => this.onPick(type),
      )
      node.disabled = !canAfford(player, def.cost)
    }
  }
}
