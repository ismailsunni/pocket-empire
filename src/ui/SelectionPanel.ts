import { AGES, TECHS, UNITS, type Cost } from '../data'
import { buildingDef, canAfford, isUnlocked, unitDef } from '../simulation/GameState'
import type { EntityId, GameState } from '../simulation/types'
import type { Selection } from '../input/Selection'
import { BuildMenu, formatCost } from './BuildMenu'
import { button, el } from './dom'

export interface SelectionHandlers {
  onBuildPick: (type: string) => void
  onTrain: (buildingId: EntityId, unit: string) => void
  onResearch: (buildingId: EntityId, tech: string) => void
  onAdvanceAge: (buildingId: EntityId) => void
  onCancelQueue: (buildingId: EntityId, index: number) => void
  onStop: () => void
}

interface CostedButton {
  node: HTMLButtonElement
  cost: Cost
  needsPopulation: boolean
}

/**
 * Collapses when nothing is selected so the world is not obscured (§17).
 *
 * The DOM is rebuilt only when the panel's shape changes. Rebuilding it on
 * every refresh detaches buttons mid-tap, which loses the tap.
 */
export class SelectionPanel {
  private readonly root: HTMLElement
  private readonly title: HTMLElement
  private readonly actions: HTMLElement
  private readonly queue: HTMLElement
  readonly buildMenu: BuildMenu
  private shape = ''
  private shownBuilding: EntityId | null = null
  private costed: CostedButton[] = []
  private fills: HTMLElement[] = []

  constructor(
    parent: HTMLElement,
    private readonly handlers: SelectionHandlers,
  ) {
    this.root = el('div', 'selection', parent)
    this.root.hidden = true
    this.title = el('h2', undefined, this.root)
    this.actions = el('div', 'actions', this.root)
    this.buildMenu = new BuildMenu(this.root, handlers.onBuildPick)
    this.queue = el('div', 'queue', this.root)
  }

  refresh(state: GameState, selection: Selection, playerId: number): void {
    const empty = selection.isEmpty
    this.root.hidden = empty
    if (empty) {
      this.buildMenu.close()
      this.shape = ''
      return
    }

    const player = state.players[playerId]
    const building = selection.buildingId === null ? null : state.buildings.get(selection.buildingId)
    const shape = [
      selection.buildingId,
      building?.type,
      building?.complete,
      building?.queue.map((item) => `${item.kind}:${item.id}`).join(','),
      [...selection.units].sort((a, b) => a - b).join(','),
      this.buildMenu.open,
      player.ageIndex,
      player.techs.length,
    ].join('|')

    if (shape !== this.shape) {
      this.shape = shape
      this.shownBuilding = selection.buildingId
      this.rebuild(state, selection, playerId)
    }
    this.updateDynamic(state, playerId)
  }

  private rebuild(state: GameState, selection: Selection, playerId: number): void {
    this.actions.innerHTML = ''
    this.queue.innerHTML = ''
    this.costed = []
    this.fills = []

    if (selection.buildingId !== null) this.renderBuilding(state, selection.buildingId, playerId)
    else this.renderUnits(state, selection, playerId)
    this.buildMenu.refresh(state.players[playerId], this.costed)
  }

  /** Cheap per-frame work: affordability and production progress only. */
  private updateDynamic(state: GameState, playerId: number): void {
    const player = state.players[playerId]
    for (const item of this.costed) {
      item.node.disabled =
        !canAfford(player, item.cost) || (item.needsPopulation && player.popUsed >= player.popCap)
    }
    if (this.shownBuilding === null) return
    const building = state.buildings.get(this.shownBuilding)
    if (!building) return
    building.queue.forEach((item, index) => {
      const fill = this.fills[index]
      if (fill) fill.style.width = `${((item.total - item.remaining) / item.total) * 100}%`
    })
    if (!building.complete) {
      const def = buildingDef(building.type)
      const progress = Math.floor((building.buildProgress / (def.buildTime * 20)) * 100)
      this.title.textContent = `${def.name} (building ${progress}%)`
    }
  }

  private renderUnits(state: GameState, selection: Selection, playerId: number): void {
    const counts = new Map<string, number>()
    for (const id of selection.units) {
      const unit = state.units.get(id)
      if (unit) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
    }
    this.title.textContent =
      [...counts.entries()]
        .map(([type, count]) => `${count} ${UNITS[type].name}${count === 1 ? '' : 's'}`)
        .join(', ') ||
      'Nothing selected'

    if (selection.villagers(state).length > 0) {
      const toggle = button('Build', this.actions, () => {
        this.buildMenu.toggle()
        this.refresh(state, selection, playerId)
      })
      toggle.classList.toggle('primary', this.buildMenu.open)
    }
    button('Stop', this.actions, this.handlers.onStop)
  }

  private renderBuilding(state: GameState, id: EntityId, playerId: number): void {
    const building = state.buildings.get(id)
    if (!building) return
    const def = buildingDef(building.type)
    const player = state.players[playerId]
    this.title.textContent = `${def.name} — ${Math.ceil(building.hp)}/${def.hp} HP`

    if (building.owner !== playerId || !building.complete) return

    for (const unitType of def.produces ?? []) {
      const unitData = unitDef(unitType)
      const node = button(
        `${unitData.name}<span class="cost">${formatCost(unitData.cost)}</span>`,
        this.actions,
        () => this.handlers.onTrain(building.id, unitType),
      )
      this.costed.push({ node, cost: unitData.cost, needsPopulation: true })
    }

    const nextAge = AGES[player.ageIndex + 1]
    if (nextAge && nextAge.researchedAt === building.type) {
      const node = button(
        `Advance to ${nextAge.name}<span class="cost">${formatCost(nextAge.cost)}</span>`,
        this.actions,
        () => this.handlers.onAdvanceAge(building.id),
      )
      node.classList.add('primary')
      this.costed.push({ node, cost: nextAge.cost, needsPopulation: false })
    }

    for (const [techId, tech] of Object.entries(TECHS)) {
      if (tech.researchedAt !== building.type) continue
      if (!isUnlocked(player, tech.age) || player.techs.includes(techId)) continue
      const node = button(
        `${tech.name}<span class="cost">${formatCost(tech.cost)}</span>`,
        this.actions,
        () => this.handlers.onResearch(building.id, techId),
      )
      this.costed.push({ node, cost: tech.cost, needsPopulation: false })
    }

    building.queue.forEach((item, index) => {
      const slot = el('button', 'slot', this.queue)
      this.fills.push(el('div', 'fill', slot))
      const label = el('span', undefined, slot)
      label.textContent =
        item.kind === 'unit'
          ? UNITS[item.id].name.slice(0, 6)
          : item.kind === 'age'
            ? 'Age'
            : TECHS[item.id].name.slice(0, 6)
      slot.title = 'Cancel'
      slot.addEventListener('click', () => this.handlers.onCancelQueue(building.id, index))
    })
  }
}
