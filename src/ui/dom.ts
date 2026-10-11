/** Options d'un élément créé par `el`. */
export interface ElementOptions {
  readonly className?: string
  readonly text?: string
  readonly attributes?: Readonly<Record<string, string>>
}

/** Crée un élément, avec sa classe, son texte et ses attributs, puis y range ses enfants. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (options.className) element.className = options.className
  if (options.text !== undefined) element.textContent = options.text
  Object.entries(options.attributes ?? {}).forEach(([name, value]) => element.setAttribute(name, value))
  element.append(...children)
  return element
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/** Crée un élément SVG avec ses attributs. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag)
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)))
  return element
}
