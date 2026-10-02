// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import offersJson from '../../public/offers.json';
import indexHtml from '../../index.html?raw';
import mainSrc from '../../src/main.ts?raw';
import privacyMd from '../../PRIVACY.md?raw';
import securityMd from '../../SECURITY.md?raw';
import { applyQuestFilters, compareQuests, questType, validateOffer } from '../../src/offers';
import { typeBadge } from '../../src/render/quests';
import { parseSession, SESSION_FIELDS, validateSession } from '../../src/session';

/** Security review of PR #5 (rewardType / needsPastSpend, quest order, Filter box, session v3). */

const base = {
  id: 'brand-in', brand: 'Brand', category: 'cafe', offer: 'Free drink', howToClaim: 'App', countries: ['IN'],
  channel: 'in-store', sourceUrl: 'https://example.com', lastVerified: '2026-10-02',
  rewardType: 'free', needsPastSpend: false,
};

describe('PR #5: offer rewardType / needsPastSpend validation', () => {
  it('the base fixture is valid', () => expect(validateOffer(base).ok).toBe(true));
  it.each([
    ['rewardType missing', (({ rewardType: _r, ...rest }) => rest)(base)],
    ['needsPastSpend missing', (({ needsPastSpend: _n, ...rest }) => rest)(base)],
    ['rewardType wrong case', { ...base, rewardType: 'Free' }],
    ['rewardType padded', { ...base, rewardType: 'free ' }],
    ['rewardType markup', { ...base, rewardType: '<img src=x>' }],
    ['rewardType prototype key', { ...base, rewardType: '__proto__' }],
    ['rewardType inherited name', { ...base, rewardType: 'toString' }],
    ['rewardType array', { ...base, rewardType: ['free'] }],
    ['needsPastSpend string', { ...base, needsPastSpend: 'false' }],
    ['needsPastSpend number', { ...base, needsPastSpend: 0 }],
    ['needsPastSpend null', { ...base, needsPastSpend: null }],
  ])('rejects %s', (_l, raw) => expect(validateOffer(raw).ok).toBe(false));
  it('copies only the validated primitive values', () => {
    const r = validateOffer({ ...base, rewardType: 'discount', needsPastSpend: true });
    expect(r.ok && r.offer.rewardType).toBe('discount');
    expect(r.ok && r.offer.needsPastSpend).toBe(true);
  });
  it('every shipped offer is classified with exact values', () => {
    for (const o of offersJson.offers as Record<string, unknown>[]) {
      expect(['free', 'discount']).toContain(o.rewardType);
      expect(typeof o.needsPastSpend).toBe('boolean');
    }
  });
});

describe('PR #5: ordering and filtering are total and side-effect free', () => {
  const mk = (id: string, rewardType: 'free' | 'discount', needsPastSpend: boolean, verified = true) =>
    ({ id, brand: id, rewardType, needsPastSpend, verified });
  const list = [mk('c', 'discount', true), mk('b', 'discount', false, false), mk('a', 'free', false)];
  it('applyQuestFilters never mutates its input and can hide everything', () => {
    const copy = JSON.parse(JSON.stringify(list));
    expect(applyQuestFilters(list, { verifiedOnly: false, types: { free: false, discount: false, past: false } })).toEqual([]);
    expect(applyQuestFilters(list, { verifiedOnly: true, types: { free: true, discount: true, past: true } }).map((o) => o.id)).toEqual(['c', 'a']);
    expect(list).toEqual(copy);
  });
  it('questType only ever yields one of the three filter keys', () => {
    for (const o of list) expect(['free', 'discount', 'past']).toContain(questType(o));
  });
  it('compareQuests tolerates hostile distances (NaN, -Infinity) deterministically', () => {
    const d = new Map([['a', Number.NaN], ['b', -Infinity]]);
    const x = mk('a', 'free', false);
    const y = mk('b', 'free', false);
    expect(compareQuests(x, y, d)).toBe(-compareQuests(y, x, d));
    expect(compareQuests(x, x, d)).toBe(0);
  });
});

describe('PR #5: type chip renders constant text only', () => {
  it('uses only class, data-quest-type and constant text, whatever the offer holds', () => {
    const chip = typeBadge({ rewardType: 'free', needsPastSpend: true, brand: '<img src=x onerror=alert(1)>' } as never);
    expect(chip.querySelector('img,script')).toBeNull();
    expect(chip.getAttributeNames().sort()).toEqual(['class', 'data-quest-type']);
    expect(chip.dataset.questType).toBe('past');
    expect(chip.textContent).toBe('Quest type: Needs past spend');
  });
});

describe('PR #5: session v3 tampering', () => {
  const good = {
    v: 3, city: 'Pune', lat: 18.52, lng: 73.85, countryCode: 'IN', month: 3, radius: 5000, tab: 'nearby', done: [], verifiedOnly: false,
    types: { free: true, discount: true, past: true },
  };
  const { types: _t, ...v2 } = { ...good, v: 2 };
  const { verifiedOnly: _v, ...v1Fields } = v2;
  const v1 = { ...v1Fields, v: 1 };
  it('accepts v3, migrates exact v1 and v2', () => {
    expect(parseSession(JSON.stringify(good))?.types).toEqual(good.types);
    expect(parseSession(JSON.stringify(v2))?.v).toBe(3);
    expect(parseSession(JSON.stringify(v1))?.v).toBe(3);
  });
  it.each([
    ['top-level __proto__ key', '{"__proto__":{"polluted":1},' + JSON.stringify(good).slice(1)],
    ['__proto__ inside types', JSON.stringify(good).replace('"types":{', '"types":{"__proto__":{"free":false},')],
    ['constructor inside types', JSON.stringify({ ...good, types: { ...good.types, constructor: true } })],
    ['types as string', JSON.stringify({ ...good, types: 'free,discount,past' })],
    ['types nested object value', JSON.stringify({ ...good, types: { ...good.types, free: { valueOf: true } } })],
    ['v1 record carrying types', JSON.stringify({ ...v1, types: good.types })],
    ['v1 record carrying verifiedOnly', JSON.stringify({ ...v1, verifiedOnly: true })],
    ['v3 record shaped as v2', JSON.stringify({ ...v2, v: 3 })],
    ['v2 record labelled v1', JSON.stringify({ ...v2, v: 1 })],
  ])('rejects %s', (_l, raw) => {
    expect(parseSession(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('returns a fresh types object, not the parsed one', () => {
    const raw = { ...good, types: { free: false, discount: true, past: true } };
    const out = validateSession(raw);
    expect(out?.types).toEqual(raw.types);
    expect(out?.types).not.toBe(raw.types);
  });
  it('rejects a v3 record over the 16 KB cap before parsing', () => {
    const padded = JSON.stringify(good).replace('"city":"Pune"', `"city":"${'a'.repeat(16_400)}"`);
    expect(parseSession(padded)).toBeNull();
  });
});

describe('PR #5: Filter box markup and wiring', () => {
  const filterMarkup = indexHtml.slice(indexHtml.indexOf('id="type-filter"'), indexHtml.indexOf('role="tablist"'));
  it('is a disclosure button that controls the box, with no inline styles or handlers', () => {
    expect(filterMarkup).toContain('aria-expanded="false"');
    expect(filterMarkup).toContain('aria-controls="filter-box"');
    expect(filterMarkup).toMatch(/id="filter-box"[^>]*hidden/);
    expect(filterMarkup).not.toMatch(/\sstyle=|\son[a-z]+=/i);
    expect(filterMarkup.match(/type="checkbox"/g)).toHaveLength(3);
  });
  it('registers the document-level outside-click listener once, at module load', () => {
    expect(mainSrc.match(/document\.addEventListener\(/g)).toHaveLength(1);
    expect(mainSrc).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML\(|document\.write\(/);
  });
});

describe('PR #5: privacy docs match the session record', () => {
  it('SECURITY.md lists every session field and PRIVACY.md mentions the Filter', () => {
    for (const f of SESSION_FIELDS) expect(securityMd).toContain(f);
    expect(securityMd).toContain('version 3');
    const holdsOnly = privacyMd.slice(privacyMd.indexOf('It holds only'), privacyMd.indexOf('Nothing else is saved'));
    expect(holdsOnly).toMatch(/Verified only/);
    expect(holdsOnly).toMatch(/Filter/);
  });
});
