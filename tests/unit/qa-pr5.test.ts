import classificationMd from '../../docs/OFFER_CLASSIFICATION.md?raw';
import offersJson from '../../public/offers.json';
import { describe, expect, it } from 'vitest';
import { applyQuestFilters, questTier, questType, sortQuests, validateOffersFile } from '../../src/offers';
import type { Offer } from '../../src/types';

/*
 * QA: PR #5 (DECISIONS #27). Independent data invariants for rewardType / needsPastSpend on the
 * shipped public/offers.json, plus a cross-check that docs/OFFER_CLASSIFICATION.md matches the data.
 * Complements tests/unit/quest-order.test.ts (which has the narrower purchaseRequired rule and a
 * past-spend regex); this file adds minSpend, money-off / points wording, spend-earned tiers, the
 * visible-steps rule and the doc table.
 */

const offers: Offer[] = validateOffersFile(offersJson, () => undefined).offers;
const byId = new Map(offers.map((o) => [o.id, o]));
const text = (o: Offer): string => [o.offer, o.rewardItem, o.howToClaim, ...(o.steps ?? []), o.minSpend].filter(Boolean).join(' ');
/** What the card shows under "How to claim": the steps when present, otherwise howToClaim. */
const visibleSteps = (o: Offer): string => (o.steps?.length ? o.steps.join(' ') : o.howToClaim);
const tier0 = offers.filter((o) => questTier(o) === 0);

/**
 * Free (tier 0) offers whose details are not published and that are unverified. The doc's own rule
 * ("when unsure use discount") says these must be discount. QA-PR5-01 reclassified the last three
 * (la-pinoz-in, theobroma-in, starbucks-sg); keep this empty.
 */
const KNOWN_UNCLEAR_FREE = new Set<string>();

/** Past-spend offers whose visible steps don't say why. QA-PR5-02 fixed the last two; keep this empty. */
const KNOWN_STEPS_WITHOUT_REASON = new Set<string>();

describe('QA PR #5: free means free', () => {
  it('a stated minSpend is never tier 0 (free with no past spend)', () => {
    for (const o of offers) if (o.minSpend) expect(questTier(o), `${o.id} minSpend "${o.minSpend}"`).not.toBe(0);
  });

  it('purchaseRequired true or a minSpend means rewardType "discount" (unless the tier is past spend)', () => {
    for (const o of offers) {
      if (o.purchaseRequired === true) expect(o.rewardType, o.id).toBe('discount');
      if (o.minSpend && !o.needsPastSpend) expect(o.rewardType, o.id).toBe('discount');
    }
  });

  it('tier 0 offers never ask you to buy something to get the reward (in store)', () => {
    // sephora-us-ca: free in store, $25 minimum only online (doc judgement call, accepted).
    const allowed = new Set(['sephora-us-ca']);
    const BUY = /\b(buy|purchase|spend|pay)\b|with a .*(burger|purchase)|tickets? booked|companion/i;
    const NO_BUY = /no purchase|\$0\+ purchase|on purchases during/gi;
    for (const o of tier0) {
      const t = [o.offer, o.rewardItem, o.howToClaim, ...(o.steps ?? [])].filter(Boolean).join(' ');
      if (BUY.test(t.replace(NO_BUY, '')) && !allowed.has(o.id)) expect.fail(`${o.id} is tier 0 but says: ${t}`);
    }
  });

  it('tier 0 offers name a free thing (free, gift, treat, complimentary), never only money off, points or a voucher value', () => {
    for (const o of tier0) {
      const t = `${o.offer} ${o.rewardItem ?? ''}`;
      expect(/\bfree\b|gift|treat|complimentary/i.test(t), `${o.id}: ${t}`).toBe(true);
      expect(/\d+\s?% off|buy 1 get 1|voucher worth|[$£₹]\s?\d+ (voucher|off)/i.test(t), `${o.id}: ${t}`).toBe(false);
    }
  });

  it('percentage off, Buy 1 Get 1, cash vouchers and bonus points are discounts', () => {
    const MONEY = /^\s*(\d+% off|buy 1 get 1|[$£₹]|nz\$|\d+ bonus|\d+(\.\d+)?x)/i;
    for (const o of offers) {
      if (MONEY.test(o.offer) || (o.rewardItem && MONEY.test(o.rewardItem))) {
        if (!o.needsPastSpend) expect(o.rewardType, `${o.id}: ${o.offer}`).toBe('discount');
      }
    }
  });

  it('unverified offers with unpublished details are not tier 0 (QA-PR5-01 allow-list may only shrink)', () => {
    const unclear = tier0.filter(
      (o) => (!o.verified && /not published|details not|check (the app|with store)/i.test(o.offer)) || /treats and bonus/i.test(o.offer),
    );
    for (const o of unclear) expect(KNOWN_UNCLEAR_FREE.has(o.id), `${o.id} is new: classify as discount`).toBe(true);
    for (const id of KNOWN_UNCLEAR_FREE) expect(byId.has(id), `${id} no longer exists; drop it from the list`).toBe(true);
  });
});

describe('QA PR #5: needs past spend', () => {
  // Spend-, visit- or points-earned tiers, past transactions, paid memberships, minimum yearly spend.
  const PAST =
    /\b(prior|previous|past|last) (\d+ months|12 months|year|365 days)|months before (your )?birthday month|in the year before|first visit|visit once|dine once|purchase first|\+ with any purchase|shop enough|\(\d[\d,]* (stars|points|crumbs)\)|\d[\d,]*\+? (stars|points|crumbs) earned|\b(reach|reached|be a) (gold|silver|black|level|insider|platinum)|gold-level|silver-status|level \d\+|\b(silver|gold|club), (gold|platinum)|gold and (higher|platinum)|gold or platinum|\bpaid (membership|member|westst)|membership \(rs|total spend|spend (a|in) (year|12 months)|yearly spend|[₹$][1-9][\d,]*\+ (spend|purchase)/i;
  // Offers whose text matches PAST only through a higher tier that the entry tier doesn't need.
  const BASE_TIER_OK = new Set(['nykaa-in', 'starbucks-nz', 'the-body-shop-in', 'dsw-us', 'smoothie-king-us', 'marks-and-spencer-in']);

  it('every offer that states a past purchase, a spend-earned tier or a paid membership has needsPastSpend true', () => {
    const misses = offers.filter((o) => PAST.test(text(o)) && !o.needsPastSpend && !BASE_TIER_OK.has(o.id));
    expect(misses.map((o) => `${o.id}: ${text(o)}`)).toEqual([]);
  });

  it('the base-tier exceptions really are reachable by joining for free', () => {
    for (const id of BASE_TIER_OK) {
      const o = byId.get(id);
      expect(o, id).toBeDefined();
      expect(o?.needsPastSpend, id).toBe(false);
      expect(o?.rewardType, id).toBe('discount');
    }
  });

  it.each([
    // [id, tier, deciding text]
    ['starbucks-us', 2, 'make 1 Star-earning purchase first'],
    ['starbucks-ca', 2, 'make 1 Star-earning purchase first'],
    ['costa-gb', 0, 'Join Costa Club in the Costa app and add your birthday'],
    ['costa-coffee-in', 2, 'at least one transaction in the past 12 months'],
    ['prezzo-gb', 2, 'dine once before your birthday'],
    ['duck-donuts-us', 2, 'active within the past 365 days'],
    ['plum-in', 2, 'Join Plum+ with any purchase'],
    ['westside-in', 2, 'Buy WestStyleClub membership'],
    ['timezone-in', 2, 'Blue Elite'],
    ['barbeque-nation-in', 2, 'Reach Gold or Platinum'],
    ['club-itc-in', 2, 'Gold and higher'],
    ['adidas-in', 2, 'Level 2+'],
    ['grilld-au', 1, 'with a burger or salad'],
    ['cheesecake-factory-us', 1, 'when you make a purchase'],
    ['clinique-us', 1, '$55 purchase'],
    ['pizza-express-gb', 1, '£15'],
    ['imagicaa-in', 1, 'pre-book regular tickets'],
    ['water-kingdom-in', 1, '3 companion tickets'],
    ['wetnjoy-lonavala-in', 1, '4+ companions'],
    ['wonderla-in', 1, 'Buy 1 Get 1'],
    ['starbucks-nz', 1, 'free size upgrade (Green)'],
    ['the-body-shop-gb', 1, '£5 voucher'],
    ['bata-in', 1, 'worth up to ₹750'],
    ['ulta-us', 0, 'no purchase needed in store'],
    ['bath-and-body-works-us', 0, 'One free item'],
    // QA-PR5-01: unclear "treats" are discount.
    ['la-pinoz-in', 1, 'details not published'],
    ['theobroma-in', 1, 'details not published'],
    ['starbucks-sg', 1, 'bonus Stars'],
    // QA-PR5-02: the past-spend condition is in the visible steps.
    ['muffin-break-au', 2, 'Make a purchase in the 12 months before your birthday'],
    ['timezone-in', 2, 'Reach Blue Elite tier or above'],
  ] as const)('%s is tier %i (field says "%s")', (id, tier, quote) => {
    const o = byId.get(id);
    expect(o, id).toBeDefined();
    expect(text(o as Offer)).toContain(quote);
    expect(questTier(o as Offer)).toBe(tier);
  });

  it('every past-spend card says why in its visible steps (QA-PR5-02 allow-list may only shrink)', () => {
    const REASON =
      /purchase|spend|\bbuy\b|visit|transaction|tier|level|gold|silver|black|platinum|elite|insider|trendsetter|status|stars|points|crumbs|active|paid|membership|once in last|shop enough|dine once/i;
    const missing = offers.filter((o) => o.needsPastSpend && !REASON.test(visibleSteps(o))).map((o) => o.id);
    for (const id of missing) expect(KNOWN_STEPS_WITHOUT_REASON.has(id), `${id}: steps hide the past-spend condition`).toBe(true);
    for (const id of KNOWN_STEPS_WITHOUT_REASON) expect(byId.get(id)?.needsPastSpend, id).toBe(true);
  });
});

describe('QA PR #5: docs/OFFER_CLASSIFICATION.md matches public/offers.json', () => {
  const doc = classificationMd;
  const rows = [...doc.matchAll(/^\| `([a-z0-9-]+)` \| [^|]+ \| (free|discount) \| (true|false) \|/gm)].map((m) => ({
    id: m[1] as string,
    rewardType: m[2] as string,
    needsPastSpend: m[3] === 'true',
  }));

  it('has exactly one row per offer, with the same rewardType and needsPastSpend', () => {
    expect(rows).toHaveLength(offers.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      const o = byId.get(r.id);
      expect(o, `${r.id} in doc but not in offers.json`).toBeDefined();
      expect({ id: r.id, rewardType: o?.rewardType, needsPastSpend: o?.needsPastSpend }).toEqual(r);
    }
  });

  it('the counts table matches the data', () => {
    const counts = [0, 0, 0];
    for (const o of offers) counts[questTier(o)] = (counts[questTier(o)] ?? 0) + 1;
    const m = /\| 0 \| [^|]+\| (\d+) \|\s*\n\| 1 \| [^|]+\| (\d+) \|\s*\n\| 2 \| [^|]+\| (\d+) \|\s*\n\| \| Total \| (\d+) \|/.exec(doc);
    expect(m, 'counts table').not.toBeNull();
    expect([Number(m?.[1]), Number(m?.[2]), Number(m?.[3])]).toEqual(counts);
    expect(Number(m?.[4])).toBe(offers.length);
  });

  it('every judgement call names an existing offer', () => {
    const calls = [...doc.matchAll(/^- `([a-z0-9-]+)` \(/gm)].map((m) => m[1] as string);
    expect(calls.length).toBeGreaterThan(0);
    for (const id of calls) expect(byId.has(id), id).toBe(true);
  });
});

describe('QA PR #5: follow-up fixes', () => {
  it('tier counts are 25 / 43 / 34', () => {
    const counts = [0, 0, 0];
    for (const o of offers) counts[questTier(o)] = (counts[questTier(o)] ?? 0) + 1;
    expect(counts).toEqual([25, 43, 34]);
  });
  it('nykaa-in needs a purchase at the time (QA-PR5-04) and stays a discount', () => {
    expect(byId.get('nykaa-in')).toMatchObject({ purchaseRequired: true, rewardType: 'discount', needsPastSpend: false });
  });
  it('steps stay within the contributor limits (6 steps, 100 characters, no em dash)', () => {
    for (const id of ['muffin-break-au', 'timezone-in']) {
      const steps = byId.get(id)?.steps ?? [];
      expect(steps.length, id).toBeLessThanOrEqual(6);
      for (const s of steps) {
        expect(s.length, `${id}: ${s}`).toBeLessThanOrEqual(100);
        expect(s, id).not.toContain('\u2014');
      }
    }
  });
});

describe('QA PR #5: filter + order on the shipped data', () => {
  it('per country, the three type filters partition the list and each keeps the tier order', () => {
    const countries = new Set(offers.flatMap((o) => o.countries));
    for (const c of countries) {
      const list = sortQuests(offers.filter((o) => o.countries.includes(c)));
      const parts = (['free', 'discount', 'past'] as const).map((t) =>
        applyQuestFilters(list, { verifiedOnly: false, types: { free: t === 'free', discount: t === 'discount', past: t === 'past' } }),
      );
      expect(parts.flat().map((o) => o.id), c).toEqual(list.map((o) => o.id));
      parts.forEach((p, i) => p.forEach((o) => expect(questTier(o), `${c} ${o.id}`).toBe(i)));
    }
  });

  it('Verified only and the type filter commute', () => {
    const types = { free: false, discount: true, past: true };
    const a = applyQuestFilters(offers, { verifiedOnly: true, types }).map((o) => o.id);
    const b = offers.filter((o) => o.verified && questType(o) !== 'free').map((o) => o.id);
    expect(a).toEqual(b);
  });
});
