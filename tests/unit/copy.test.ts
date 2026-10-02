import offersJson from '../../public/offers.json';
import indexHtml from '../../index.html?raw';
import { describe, expect, it } from 'vitest';

/*
 * House style: no em dashes (U+2014) and no spaced en dashes (" – ") in anything a user can read.
 * Use commas, colons, periods or parentheses instead.
 */
const EM = '—';
const SPACED_EN = ' – ';

function dashLines(name: string, text: string): string[] {
  return text
    .split('\n')
    .map((line, i) => [line, i + 1] as const)
    .filter(([line]) => line.includes(EM) || line.includes(SPACED_EN))
    .map(([line, n]) => `${name}:${n}: ${line.trim()}`);
}

function strings(v: unknown, path = '$'): Array<[string, string]> {
  if (typeof v === 'string') return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`));
  return [];
}

describe('copy: no em dashes', () => {
  const src = import.meta.glob('../../src/**/*.{ts,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('scans src/', () => expect(Object.keys(src).length).toBeGreaterThan(10));
  it('src/ (UI strings, quest templates, comments) has no em dash or spaced en dash', () => {
    expect(Object.entries(src).flatMap(([p, t]) => dashLines(p.replace(/^.*\/src\//, 'src/'), t))).toEqual([]);
  });
  it('index.html has no em dash or spaced en dash', () => {
    expect(dashLines('index.html', indexHtml)).toEqual([]);
  });
  // Expected to FAIL until the orchestrator cleans the offer data (public/offers.json is data-owned).
  it('PENDING DATA CLEANUP (orchestrator): public/offers.json text has no em dash or spaced en dash', () => {
    const bad = strings(offersJson).filter(([, s]) => s.includes(EM) || s.includes(SPACED_EN));
    expect(bad.map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });
});

/*
 * Soft Premium redesign (docs/design/DESIGN.md §7): no emoji anywhere in the UI. Icons are inline SVG
 * built in src/render/icons.ts. ©, ® and ™ are ordinary text symbols and stay allowed.
 */
describe('copy: no emoji', () => {
  const EMOJI = /(?![\u00a9\u00ae\u2122])[\p{Extended_Pictographic}\u2726\u2727\u2661\u2665\ufe0f]/u;
  const src = import.meta.glob('../../src/**/*.{ts,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const hits = (name: string, text: string) =>
    text
      .split('\n')
      .map((line, i) => [line, i + 1] as const)
      .filter(([line]) => EMOJI.test(line))
      .map(([line, n]) => `${name}:${n}: ${line.trim()}`);
  it('src/ has no emoji', () => {
    expect(Object.entries(src).flatMap(([p, t]) => hits(p.replace(/^.*\/src\//, 'src/'), t))).toEqual([]);
  });
  it('index.html has no emoji', () => {
    expect(hits('index.html', indexHtml)).toEqual([]);
  });
});

