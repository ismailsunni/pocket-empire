export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (parent) parent.appendChild(node)
  return node
}

export const button = (label: string, parent: HTMLElement, onClick: () => void): HTMLButtonElement => {
  const node = el('button', undefined, parent)
  node.innerHTML = label
  node.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return node
}
