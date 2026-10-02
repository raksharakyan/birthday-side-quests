import { createSuggester, type Suggestion } from '../autocomplete';
import { el } from './dom';

/**
 * WAI-ARIA 1.2 combobox (list autocomplete, manual selection) for the city input.
 * The input keeps role="combobox" + aria-autocomplete/expanded/controls/activedescendant; the popup
 * holds a role="listbox" with role="option" items built only with el() (text nodes, no HTML).
 */

export interface ComboboxOptions {
  input: HTMLInputElement;
  /** Container to append the popup to (positioned relative). */
  host: HTMLElement;
  /** Visually hidden polite live region for "N suggestions available". */
  live: HTMLElement;
  onSelect: (s: Suggestion) => void;
  fetchImpl?: typeof fetch;
}

export interface Combobox {
  close(): void;
  /** Close and cancel any pending/in-flight lookup (call on submit). */
  cancel(): void;
}

export function createCombobox(opts: ComboboxOptions): Combobox {
  const { input, host, live } = opts;
  const listId = `${input.id}-suggestions`;
  const listbox = el('ul', { id: listId, class: 'ac-list', role: 'listbox', 'aria-label': 'Place suggestions' });
  const popup = el('div', { class: 'ac-popup', hidden: true }, [
    listbox,
    el('p', { class: 'ac-footer' }, ['Suggestions by Photon · © OpenStreetMap']),
  ]);
  host.appendChild(popup);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);

  let items: Suggestion[] = [];
  let active = -1;
  let lastAnnounced = '';

  function optionId(i: number): string {
    return `${listId}-${i}`;
  }

  function setActive(i: number): void {
    active = i;
    const opts = listbox.querySelectorAll<HTMLLIElement>('[role="option"]');
    opts.forEach((o, idx) => o.setAttribute('aria-selected', String(idx === i)));
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', optionId(i));
      opts[i]?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function close(): void {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function announce(msg: string): void {
    if (msg === lastAnnounced) return;
    lastAnnounced = msg;
    live.textContent = msg;
  }

  function select(i: number): void {
    const s = items[i];
    if (!s) return;
    suggester.cancel();
    input.value = s.label;
    close();
    items = [];
    lastAnnounced = '';
    opts.onSelect(s);
  }

  function optionNode(s: Suggestion, i: number): HTMLLIElement {
    const comma = s.label.indexOf(', ');
    const primary = comma > 0 ? s.label.slice(0, comma) : s.label;
    const secondary = comma > 0 ? s.label.slice(comma + 2) : '';
    const li = el('li', { id: optionId(i), class: 'ac-option', role: 'option', 'aria-selected': 'false' }, [
      el('span', { class: 'ac-option__pin', 'aria-hidden': 'true' }, ['📍']),
      el('span', { class: 'ac-option__text' }, [
        el('span', { class: 'ac-option__name' }, [primary]),
        secondary ? el('span', { class: 'ac-option__detail' }, [secondary]) : null,
      ]),
    ]);
    // Prevent the input from blurring before the click lands (mouse and touch compat events).
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') e.preventDefault();
    });
    li.addEventListener('click', () => select(i));
    li.addEventListener('mousemove', () => {
      if (active !== i) setActive(i);
    });
    return li;
  }

  function show(results: Suggestion[]): void {
    items = results;
    if (results.length === 0 || document.activeElement !== input) {
      listbox.replaceChildren();
      close();
      if (results.length === 0) lastAnnounced = '';
      return;
    }
    listbox.replaceChildren(...results.map(optionNode));
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
    announce(`${results.length} suggestion${results.length === 1 ? '' : 's'} available. Use up and down arrows to choose.`);
  }

  const suggester = createSuggester(
    (results, query) => {
      // Only show results for what is in the box right now.
      const now = input.value.replace(/\s+/g, ' ').trim();
      if (results.length > 0 && now.toLocaleLowerCase() !== query.toLocaleLowerCase()) return;
      show(results);
    },
    opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
  );

  input.addEventListener('input', () => suggester.request(input.value));

  input.addEventListener('keydown', (e) => {
    const open = !popup.hidden && items.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        if (!open) {
          if (items.length > 0) {
            show(items);
            setActive(0);
            e.preventDefault();
          }
          return;
        }
        e.preventDefault();
        setActive(active >= items.length - 1 ? 0 : active + 1);
        return;
      case 'ArrowUp':
        if (!open) return;
        e.preventDefault();
        setActive(active <= 0 ? items.length - 1 : active - 1);
        return;
      case 'Enter':
        if (open && active >= 0) {
          e.preventDefault();
          select(active);
        } else {
          // Let the form submit normally (Nominatim path).
          close();
        }
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        }
        return;
      case 'Tab':
        close();
        return;
      default:
        return;
    }
  });

  input.addEventListener('blur', () => close());
  document.addEventListener('pointerdown', (e) => {
    if (popup.hidden) return;
    const t = e.target;
    if (t instanceof Node && (host.contains(t) || t === input)) return;
    close();
  });

  return {
    close,
    cancel() {
      suggester.cancel();
      close();
    },
  };
}
