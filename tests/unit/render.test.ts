import { beforeEach, describe, expect, it, vi } from 'vitest';
import { el, externalLink } from '../../src/render/dom';
import { _resetDone, liveCard, questCard } from '../../src/render/quests';
import { questLine, QUEST_TEMPLATES } from '../../src/templates';
import { validateLiveResults } from '../../src/liveSearch';
import type { Offer } from '../../src/types';

const XSS = '<img src=x onerror=alert(1)>';

const offer: Offer = {
  id: 'xss',
  brand: XSS,
  category: 'cafe',
  offer: XSS,
  howToClaim: XSS,
  countries: ['IN'],
  channel: 'in-store',
  claimWindow: 'day',
  sourceUrl: 'https://example.com/r',
  lastVerified: '2026-10-02',
  verified: false,
};

beforeEach(() => _resetDone());

describe('el()', () => {
  it('rejects event-handler and style attributes', () => {
    expect(() => el('div', { onclick: 'x' })).toThrow();
    expect(() => el('div', { style: 'color:red' })).toThrow();
  });
  it('drops unsafe hrefs and forces rel on target=_blank', () => {
    const a = el('a', { href: 'javascript:alert(1)', target: '_blank', rel: 'opener' });
    expect(a.hasAttribute('href')).toBe(false);
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('externalLink returns a span for unsafe URLs', () => {
    expect(externalLink('http://x.com', 'x').tagName).toBe('SPAN');
  });
});

describe('questCard', () => {
  it('renders hostile strings as text only', () => {
    const card = questCard(offer, { now: new Date(Date.UTC(2026, 9, 2)), idPrefix: 't' });
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain(XSS);
    expect(card.textContent).toContain('Check with store');
  });
  it('shows directions only with a branch and all links are safe', () => {
    const now = new Date(Date.UTC(2026, 9, 2));
    expect(questCard(offer, { now, idPrefix: 't' }).querySelector('.btn--directions')).toBeNull();
    const withBranch = questCard(offer, { now, idPrefix: 't', branch: { offerId: 'xss', name: 'B', lat: 1, lng: 2 } });
    const dir = withBranch.querySelector<HTMLAnchorElement>('.btn--directions');
    expect(dir?.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=1,2');
    for (const a of withBranch.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
  it('dispatches quest-done when checked', () => {
    const card = questCard(offer, { now: new Date(), idPrefix: 't' });
    document.body.appendChild(card);
    const spy = vi.fn();
    document.addEventListener('quest-done', spy);
    const box = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
    box?.click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(card.classList.contains('is-done')).toBe(true);
    document.removeEventListener('quest-done', spy);
  });
});

describe('liveSearch validation', () => {
  it('drops non-https and malformed results and caps to 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ title: `t${i}`, url: `https://e.com/${i}`, snippet: 's', source: 'e.com' }));
    expect(validateLiveResults(many)).toHaveLength(10);
    expect(validateLiveResults([{ title: 't', url: 'javascript:alert(1)', snippet: '', source: '' }])).toEqual([]);
    expect(validateLiveResults({ results: [] })).toEqual([]);
    expect(validateLiveResults([{ title: 'x'.repeat(500), url: 'https://e.com', snippet: 'y'.repeat(900), source: '' }])[0]).toMatchObject({
      source: 'e.com',
    });
  });
  it('live card renders as text', () => {
    const c = liveCard({ title: XSS, url: 'https://e.com', snippet: XSS, source: 'e.com' });
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toContain('Unverified: check the link');
  });
});

describe('templates', () => {
  it('has 4+ variants per category and is deterministic', () => {
    for (const list of Object.values(QUEST_TEMPLATES)) expect(list.length).toBeGreaterThanOrEqual(4);
    expect(questLine('cafe', 'Starbucks')).toBe(questLine('cafe', 'Starbucks'));
    expect(questLine('cafe', '$& $1')).toContain('$& $1');
  });
});
