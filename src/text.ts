/**
 * Plain-text hygiene for strings that come from outside the app (Nominatim, Overpass, the Worker).
 * Everything is rendered with textContent, so this is not an XSS defence; it stops visual spoofing:
 *  - C0/C1 control characters;
 *  - bidi embeddings/overrides/isolates (U+202A–U+202E, U+2066–U+2069) and marks (U+200E/F, U+061C),
 *    which can make "evil.com" display as "moc.live" or reorder a sentence;
 *  - invisible formatting characters (U+200B, U+2060–U+2064, U+206A–U+206F, U+FEFF, U+FFF9–U+FFFB).
 * ZWJ/ZWNJ (U+200C/U+200D) are kept on purpose: Indic scripts and emoji sequences need them.
 */

// eslint-disable-next-line no-control-regex
export const UNSAFE_TEXT_RE =
  /[\u{0}-\u{1f}\u{7f}-\u{9f}\u{61c}\u{180e}\u{200b}\u{200e}\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2064}\u{2066}-\u{206f}\u{feff}\u{fff9}-\u{fffb}]/gu;

/** True when the string contains any character matched by UNSAFE_TEXT_RE. */
export function hasUnsafeText(s: string): boolean {
  UNSAFE_TEXT_RE.lastIndex = 0;
  const found = UNSAFE_TEXT_RE.test(s);
  UNSAFE_TEXT_RE.lastIndex = 0;
  return found;
}

/** Replaces unsafe characters with spaces, collapses whitespace, trims and caps to `max` code units. */
export function cleanDisplayText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .slice(0, max * 4)
    .replace(UNSAFE_TEXT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}
