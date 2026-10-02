import type { Category } from './types';

/**
 * Plain one-line "where to claim" hints, shown under the brand when there is no nearby branch.
 * Sentence case, no emoji, no exclamation marks. `{brand}` is replaced as plain text (textContent).
 */
export const QUEST_TEMPLATES: Record<Category, readonly string[]> = {
  cafe: [
    'Claim it at the counter in any {brand} cafe',
    'Redeem it at a {brand} cafe near you',
    'Show it at the till in any {brand} cafe',
    'Ask for it at your nearest {brand}',
    'Pick it up at any {brand} outlet',
  ],
  dessert: [
    'Claim it at any {brand} counter',
    'Redeem it at a {brand} store near you',
    'Ask for it at your nearest {brand}',
    'Show it at the till in any {brand} store',
    'Pick it up at any {brand} outlet',
  ],
  restaurant: [
    'Claim it when you dine at {brand}',
    'Mention it when you book or order at {brand}',
    'Redeem it at a {brand} restaurant near you',
    'Ask your server at any {brand}',
    'Show it when you pay at {brand}',
  ],
  beauty: [
    'Claim it at any {brand} store',
    'Redeem it at a {brand} counter near you',
    'Show it at billing in any {brand} store',
    'Ask the team at your nearest {brand}',
    'Use it in store or online at {brand}',
  ],
  fashion: [
    'Claim it at any {brand} store',
    'Redeem it at billing in a {brand} store',
    'Use it in store or online at {brand}',
    'Show it at the till in any {brand} store',
    'Ask at your nearest {brand}',
  ],
  retail: [
    'Claim it at any {brand} store',
    'Redeem it at billing in a {brand} store',
    'Use it in store or online at {brand}',
    'Ask at your nearest {brand}',
    'Show it at the till in any {brand} store',
  ],
  online: [
    'Claim it on the {brand} website or app',
    'Watch your {brand} account for the birthday reward',
    'Redeem it in the {brand} app or website',
    'Check your {brand} inbox or app in your birthday month',
    'Use it at checkout on the {brand} website or app',
  ],
};

/** Small deterministic string hash (FNV-1a 32-bit). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function questLine(category: Category, brand: string): string {
  const list = QUEST_TEMPLATES[category] ?? QUEST_TEMPLATES.retail;
  const tpl = list[hashString(brand) % list.length] ?? list[0] ?? '{brand}';
  // split/join instead of String.replace so "$&"-style patterns in a brand name stay literal.
  return tpl.split('{brand}').join(brand);
}
