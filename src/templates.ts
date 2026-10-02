import type { Category } from './types';

/** Cute one-line quest descriptions. `{brand}` is replaced as plain text (rendered via textContent). */
export const QUEST_TEMPLATES: Record<Category, readonly string[]> = {
  cafe: [
    'Sip-quest: wander into {brand} and claim your birthday brew ☕',
    'A cosy cup at {brand} has your name on it today',
    'Coffee-side quest unlocked — {brand} is calling ☁️',
    'Treat yourself: one birthday sip at {brand}',
    'Your warm-drink mission, should you choose it: {brand}',
  ],
  dessert: [
    'Sweet-tooth quest: a birthday treat awaits at {brand} 🍦',
    'Collect your sugar sparkle at {brand}',
    'Dessert detour! {brand} saved you something sweet',
    'Level up your birthday with a little something from {brand}',
    'Frosting-filled side quest: {brand} 🧁',
  ],
  restaurant: [
    'Feast quest: celebrate with a birthday bite at {brand} 🍽️',
    'Gather your party and head to {brand}',
    'A birthday plate is waiting for you at {brand}',
    'Hungry hero? {brand} has a birthday reward for you',
    'Table for a birthday legend at {brand}',
  ],
  beauty: [
    'Glow-up quest: a birthday goodie at {brand} ✨',
    'Pamper power-up unlocked at {brand}',
    'Sparkle side quest — {brand} has a gift for you',
    'Treat your skin (and soul) at {brand} this birthday',
    'Collect your shiny birthday loot from {brand} 💄',
  ],
  fashion: [
    'Style quest: a birthday reward awaits at {brand} 👗',
    'New-fit energy — {brand} has birthday perks',
    'Dress-up side quest at {brand}',
    'Strut into your birthday with {brand}',
    'Wardrobe loot drop: {brand} 🎀',
  ],
  retail: [
    'Treasure hunt: birthday perks at {brand} 🎁',
    'Shopping side quest unlocked — {brand}',
    'A little birthday loot is waiting at {brand}',
    'Pop into {brand} for your birthday bonus',
    'Gift-to-self mission: {brand}',
  ],
  online: [
    'Couch quest: claim your birthday perk from {brand} online 💻',
    'No shoes needed — {brand} has a birthday treat in-app',
    'Tap-tap-treat: {brand} birthday reward',
    'Inbox side quest: watch for {brand}’s birthday surprise 💌',
    'Digital confetti from {brand} — go claim it',
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
