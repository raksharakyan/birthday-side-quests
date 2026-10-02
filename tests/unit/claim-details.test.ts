import { beforeEach, describe, expect, it } from 'vitest';
import { validateOffer } from '../../src/offers';
import { _resetDone, claimChips, questCard } from '../../src/render/quests';
import type { Offer } from '../../src/types';

const raw = {
  id: 'cafe-in', brand: 'Cafe', category: 'cafe', offer: 'Free drink', howToClaim: 'Show the app', countries: ['IN'],
  channel: 'in-store', sourceUrl: 'https://example.com', lastVerified: '2026-10-02', verified: true,
};
const full = {
  ...raw,
  rewardItem: 'One free tall drink',
  steps: ['Join the rewards app', 'Add your birthday', 'Show the reward at the till'],
  purchaseRequired: true,
  minSpend: '₹500',
  signupLeadDays: 7,
  validFor: '7 days from your birthday',
  bring: ['App', 'Photo ID'],
};
const XSS = '<img src=x onerror=alert(1)>';
const now = new Date(Date.UTC(2026, 9, 2));

beforeEach(() => _resetDone());

describe('validateOffer: optional claim details', () => {
  it('keeps old entries without the new fields unchanged', () => {
    const r = validateOffer(raw);
    expect(r.ok).toBe(true);
    if (r.ok) for (const k of ['rewardItem', 'steps', 'purchaseRequired', 'minSpend', 'signupLeadDays', 'validFor', 'bring']) expect(r.offer).not.toHaveProperty(k);
  });
  it('accepts and keeps valid details', () => {
    const r = validateOffer(full);
    expect(r.ok && r.offer).toMatchObject({
      rewardItem: 'One free tall drink', steps: full.steps, purchaseRequired: true, minSpend: '₹500',
      signupLeadDays: 7, validFor: '7 days from your birthday', bring: ['App', 'Photo ID'],
    });
    expect(validateOffer({ ...raw, purchaseRequired: null }).ok).toBe(true);
    expect(validateOffer({ ...raw, signupLeadDays: 0 }).ok).toBe(true);
    expect(validateOffer({ ...raw, signupLeadDays: 90 }).ok).toBe(true);
  });
  it.each([
    ['rewardItem too long', { rewardItem: 'x'.repeat(141) }],
    ['rewardItem empty', { rewardItem: '  ' }],
    ['rewardItem not a string', { rewardItem: 5 }],
    ['steps empty', { steps: [] }],
    ['steps too many', { steps: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    ['step too long', { steps: ['x'.repeat(101)] }],
    ['step not a string', { steps: [{}] }],
    ['steps not an array', { steps: 'Join' }],
    ['step with bidi override', { steps: [`Join${String.fromCodePoint(0x202e)}`] }],
    ['purchaseRequired as string', { purchaseRequired: 'yes' }],
    ['minSpend too long', { minSpend: 'x'.repeat(61) }],
    ['signupLeadDays negative', { signupLeadDays: -1 }],
    ['signupLeadDays too big', { signupLeadDays: 91 }],
    ['signupLeadDays fractional', { signupLeadDays: 1.5 }],
    ['signupLeadDays as string', { signupLeadDays: '7' }],
    ['validFor too long', { validFor: 'x'.repeat(81) }],
    ['bring too many', { bring: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['bring item too long', { bring: ['x'.repeat(41)] }],
    ['bring empty', { bring: [] }],
  ])('rejects %s', (_name, extra) => {
    const r = validateOffer({ ...raw, ...extra });
    expect(r.ok).toBe(false);
  });
});

describe('claimChips', () => {
  const o = (extra: Partial<Offer>): Offer => ({ ...(validateOffer(raw) as { offer: Offer }).offer, ...extra });
  it('describes purchase, lead time, validity and what to bring', () => {
    expect(claimChips(o({ purchaseRequired: false })).map((c) => c.text)).toEqual(['No purchase needed']);
    expect(claimChips(o({ purchaseRequired: true, minSpend: '₹500' })).map((c) => c.text)).toEqual(['Purchase needed (min ₹500)']);
    expect(claimChips(o({ purchaseRequired: true })).map((c) => c.text)).toEqual(['Purchase needed']);
    expect(claimChips(o({ purchaseRequired: null, minSpend: '$10' })).map((c) => c.text)).toEqual(['Min spend: $10']);
    expect(claimChips(o({ signupLeadDays: 1 })).map((c) => c.text)).toEqual(['Join 1+ day before']);
    expect(claimChips(o({ signupLeadDays: 30 })).map((c) => c.text)).toEqual(['Join 30+ days before']);
    expect(claimChips(o({ signupLeadDays: 0 })).map((c) => c.text)).toEqual(['Join any time, even on the day']);
    expect(claimChips(o({ validFor: 'Birthday week' })).map((c) => c.text)).toEqual(['Valid: Birthday week']);
    expect(claimChips(o({ bring: ['App', 'Photo ID'] })).map((c) => c.text)).toEqual(['Bring: App, Photo ID']);
    expect(claimChips(o({}))).toEqual([]);
  });
});

describe('questCard: claim details rendering', () => {
  it('renders "You get", a numbered <ol> of steps and an accessible chip list', () => {
    const r = validateOffer(full);
    if (!r.ok) throw new Error(r.reason);
    const card = questCard(r.offer, { now, idPrefix: 't' });
    expect(card.querySelector('.quest-card__reward .get__label')?.textContent).toBe('You get');
    expect(card.querySelector('.quest-card__reward .get__value')?.textContent).toBe('One free tall drink');
    // The full offer text stays visible under the headline.
    expect(card.querySelector('.quest-card__reward .quest-card__offer')?.textContent).toBe('Free drink');
    const steps = card.querySelectorAll('.quest-card__claim ol.quest-card__steps > li');
    expect([...steps].map((li) => li.textContent)).toEqual(full.steps);
    // Steps replace the free-text howToClaim.
    expect(card.querySelector('.quest-card__claim')?.textContent).not.toContain('Show the app');
    const chips = card.querySelector('ul.claim-chips');
    expect(chips?.getAttribute('aria-label')).toBe('Before you go to Cafe');
    expect([...(chips?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Purchase needed (min ₹500)', 'Join 7+ days before', 'Valid: 7 days from your birthday', 'Bring: App, Photo ID',
    ]);
    // Icons are decorative inline SVG (no emoji anywhere on the card).
    const icons = chips?.querySelectorAll('svg.icon') ?? [];
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(card.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('old entries keep showing offer and howToClaim, with no extra blocks', () => {
    const r = validateOffer(raw);
    if (!r.ok) throw new Error(r.reason);
    const card = questCard(r.offer, { now, idPrefix: 't' });
    expect(card.querySelector('.quest-card__claim')?.textContent).toBe('Show the app');
    expect(card.querySelector('.quest-card__offer')?.textContent).toBe('Free drink');
    expect(card.querySelector('.quest-card__reward')).toBeNull();
    expect(card.querySelector('.quest-card__steps')).toBeNull();
    expect(card.querySelector('.claim-chips')).toBeNull();
  });
  it('hostile text in every new field renders as text only', () => {
    const r = validateOffer({
      ...raw, rewardItem: XSS, steps: [XSS, '<script>alert(2)</script>'], minSpend: XSS.slice(0, 60), purchaseRequired: true,
      validFor: '<svg onload=alert(3)>', bring: ['<b>x</b>'],
    });
    if (!r.ok) throw new Error(r.reason);
    const card = questCard(r.offer, { now, idPrefix: 't' });
    // Only our own decorative icons (svg.icon / claim tick, all aria-hidden) may be SVG.
    expect(card.querySelectorAll('img, script, b').length).toBe(0);
    for (const s of card.querySelectorAll('svg')) expect(s.closest('[aria-hidden="true"]')).not.toBeNull();
    expect([...card.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => a.name.startsWith('on')))).toBe(false);
    expect(card.querySelector('.quest-card__steps li')?.textContent).toBe(XSS);
    expect(card.textContent).toContain('<script>alert(2)</script>');
    expect(card.textContent).toContain('Valid: <svg onload=alert(3)>');
    expect(card.textContent).toContain('Bring: <b>x</b>');
  });
});
