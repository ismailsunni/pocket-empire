import { AGES, RESOURCE_KINDS } from '../data'
import { RESOURCE_ICONS } from '../rendering/theme'
import type { Player } from '../simulation/types'
import { el } from './dom'

/** Always visible: resources, population with a cap warning, and the age (§17). */
export class ResourceBar {
  private readonly values = new Map<string, HTMLElement>()
  private readonly pop: HTMLElement
  private readonly age: HTMLElement

  constructor(parent: HTMLElement, onPause: () => void) {
    const bar = el('div', 'topbar', parent)
    for (const kind of RESOURCE_KINDS) {
      const wrapper = el('div', 'res', bar)
      el('span', undefined, wrapper).textContent = RESOURCE_ICONS[kind]
      const value = el('span', undefined, wrapper)
      value.textContent = '0'
      this.values.set(kind, value)
    }
    el('div', 'spacer', bar)
    this.pop = el('div', 'pop', bar)
    this.age = el('div', 'age', bar)
    const pause = el('button', 'clickable', bar)
    pause.textContent = '☰'
    pause.style.padding = '4px 10px'
    pause.style.minHeight = '32px'
    pause.addEventListener('click', onPause)
  }

  refresh(player: Player): void {
    for (const kind of RESOURCE_KINDS) {
      this.values.get(kind)!.textContent = String(Math.floor(player.resources[kind]))
    }
    this.pop.textContent = `Pop ${player.popUsed}/${player.popCap}`
    this.pop.classList.toggle('capped', player.popUsed >= player.popCap)
    this.age.textContent = `Age ${AGES[player.ageIndex].numeral}`
  }
}
