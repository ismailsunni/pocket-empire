import { button, el } from './dom'

export class Screen {
  readonly root: HTMLElement
  readonly title: HTMLElement
  readonly body: HTMLElement
  readonly actions: HTMLElement

  constructor(parent: HTMLElement) {
    this.root = el('div', 'screen', parent)
    this.root.hidden = true
    this.title = el('h1', undefined, this.root)
    this.body = el('p', undefined, this.root)
    this.actions = el('div', 'row', this.root)
  }

  show(): void {
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }

  get visible(): boolean {
    return !this.root.hidden
  }

  set(title: string, body: string, actions: { label: string; primary?: boolean; run: () => void }[]): void {
    this.title.textContent = title
    this.body.textContent = body
    this.actions.innerHTML = ''
    for (const action of actions) {
      const node = button(action.label, this.actions, action.run)
      if (action.primary) node.classList.add('primary')
    }
  }
}
