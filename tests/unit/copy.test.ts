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
