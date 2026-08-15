import { AGES, TECHS, UNITS } from '../data'
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

/** Collapses when nothing is selected so the world is not obscured (§17). */
export class SelectionPanel {
  private readonly root: HTMLElement
  private readonly title: HTMLElement
  private readonly actions: HTMLElement
  private readonly queue: HTMLElement
  readonly buildMenu: BuildMenu

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

  refresh(state: GameState, selection: Selection, player: number): void {
    const empty = selection.isEmpty
    this.root.hidden = empty
    if (empty) {
      this.buildMenu.close()
      return
    }

    this.actions.innerHTML = ''
    this.queue.innerHTML = ''

    if (selection.buildingId !== null) {
      this.renderBuilding(state, selection.buildingId, player)
    } else {
      this.renderUnits(state, selection, player)
    }
    this.buildMenu.refresh(state.players[player])
  }

  private renderUnits(state: GameState, selection: Selection, player: number): void {
    const counts = new Map<string, number>()
    for (const id of selection.units) {
      const unit = state.units.get(id)
      if (unit) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1)
    }
    this.title.textContent =
      [...counts.entries()].map(([type, count]) => `${count} ${UNITS[type].name}`).join(', ') ||
      'Nothing selected'

    if (selection.villagers(state).length > 0) {
      const toggle = button('Build', this.actions, () => {
        this.buildMenu.toggle()
        this.buildMenu.refresh(state.players[player])
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
    this.title.textContent = building.complete
      ? `${def.name} — ${Math.ceil(building.hp)}/${def.hp} HP`
      : `${def.name} (building ${Math.floor((building.buildProgress / (def.buildTime * 20)) * 100)}%)`

    if (building.owner !== playerId || !building.complete) return

    for (const unitType of def.produces ?? []) {
      const unitData = unitDef(unitType)
      const node = button(
        `${unitData.name}<span class="cost">${formatCost(unitData.cost)}</span>`,
        this.actions,
        () => this.handlers.onTrain(building.id, unitType),
      )
      node.disabled = !canAfford(player, unitData.cost) || player.popUsed >= player.popCap
    }

    const nextAge = AGES[player.ageIndex + 1]
    if (nextAge && nextAge.researchedAt === building.type) {
      const node = button(
        `Advance to ${nextAge.name}<span class="cost">${formatCost(nextAge.cost)}</span>`,
        this.actions,
        () => this.handlers.onAdvanceAge(building.id),
      )
      node.disabled = !canAfford(player, nextAge.cost)
      node.classList.add('primary')
    }

    for (const [techId, tech] of Object.entries(TECHS)) {
      if (tech.researchedAt !== building.type) continue
      if (!isUnlocked(player, tech.age) || player.techs.includes(techId)) continue
      const node = button(
        `${tech.name}<span class="cost">${formatCost(tech.cost)}</span>`,
        this.actions,
        () => this.handlers.onResearch(building.id, techId),
      )
      node.disabled = !canAfford(player, tech.cost)
    }

    building.queue.forEach((item, index) => {
      const slot = el('button', 'slot', this.queue)
      const fill = el('div', 'fill', slot)
      fill.style.width = `${((item.total - item.remaining) / item.total) * 100}%`
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
