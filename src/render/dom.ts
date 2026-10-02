import { safeHttpsUrl } from '../urls';

/**
 * Tiny DOM builder. SECURITY RULES (do not relax):
 *  - text only via text nodes / textContent — never innerHTML, outerHTML, insertAdjacentHTML or document.write;
 *  - attributes only from an allow-list; on* handlers, style, src, srcdoc are rejected;
 *  - href only via safeHttpsUrl (https, no credentials).
 */

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined>;

const ALLOWED_ATTRS = new Set([
  'id', 'class', 'type', 'name', 'value', 'for', 'role', 'tabindex', 'title', 'lang', 'dir',
  'hidden', 'disabled', 'checked', 'selected', 'required', 'readonly', 'placeholder', 'autocomplete',
  'maxlength', 'minlength', 'min', 'max', 'inputmode', 'spellcheck', 'enterkeyhint', 'autocapitalize',
  'href', 'target', 'rel', 'datetime', 'alt', 'width', 'height', 'open', 'scope', 'colspan', 'novalidate',
]);

function isAllowedAttr(name: string): boolean {
  const n = name.toLowerCase();
  if (n.startsWith('on')) return false;
  if (n.startsWith('aria-') || n.startsWith('data-')) return /^[a-z][a-z0-9-]*$/.test(n);
  return ALLOWED_ATTRS.has(n);
}

function applyAttrs(node: Element, attrs: Attrs | undefined): void {
  if (!attrs) return;
  for (const [rawName, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    const name = rawName.toLowerCase();
    if (!isAllowedAttr(name)) throw new Error(`el(): attribute "${rawName}" is not allowed`);
    if (name === 'href') {
      const safe = safeHttpsUrl(String(value));
      if (!safe) continue; // silently drop unsafe links
      node.setAttribute('href', safe);
      continue;
    }
    node.setAttribute(name, value === true ? '' : String(value));
  }
  // Any external link opened in a new tab must not get window.opener or a referrer.
  if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
}

function appendChildren(node: Node, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  if (tag === ('script' as K) || tag === ('style' as K) || tag === ('iframe' as K)) {
    throw new Error(`el(): <${tag}> is not allowed`);
  }
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Plain https external link that opens in a new tab. Returns a <span> if the URL is unsafe. */
export function externalLink(href: string, text: string, attrs: Attrs = {}): HTMLAnchorElement | HTMLSpanElement {
  const safe = safeHttpsUrl(href);
  if (!safe) return el('span', { class: attrs.class ?? null }, [text]);
  return el('a', { ...attrs, href: safe, target: '_blank', rel: 'noopener noreferrer' }, [text]);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ATTRS = new Set([
  'viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'width', 'height',
  'cx', 'cy', 'r', 'x', 'y', 'rx', 'ry', 'points', 'class', 'aria-hidden', 'focusable', 'role', 'transform',
]);

/** Static SVG builder (icons only — never pass external data in here). */
export function svg(tag: string, attrs: Record<string, string> = {}, children: readonly SVGElement[] = []): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) {
    if (!SVG_ATTRS.has(k.toLowerCase())) throw new Error(`svg(): attribute "${k}" is not allowed`);
    node.setAttribute(k === 'viewbox' ? 'viewBox' : k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}
