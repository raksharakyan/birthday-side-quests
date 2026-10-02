import { describe, expect, it } from 'vitest';
import {
  clearSession, loadSession, parseSession, saveSession, SESSION_FIELDS, SESSION_KEY, validateSession, type SessionData,
} from '../../src/session';

const good: SessionData = {
  v: 3,
  city: 'Pune',
  lat: 18.5204,
  lng: 73.8567,
  countryCode: 'IN',
  month: 10,
  radius: 5000,
  tab: 'online',
  done: ['starbucks-in', 'nykaa-in'],
  verifiedOnly: true,
  types: { free: true, discount: false, past: true },
};
const ALL_ON = { free: true, discount: true, past: true };
const { verifiedOnly: _vo, types: _t1, ...v1Shape } = good;
const goodV1 = { ...v1Shape, v: 1 };
const { types: _t2, ...v2Shape } = good;
const goodV2 = { ...v2Shape, v: 2 };

/** Minimal in-memory Storage. */
function memStore(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

describe('validateSession (strict schema)', () => {
  it('accepts a well-formed record and returns a clean copy', () => {
    expect(validateSession({ ...good })).toEqual(good);
    expect(validateSession({ ...good, city: null, lat: null, lng: null, countryCode: null, month: null })).not.toBeNull();
    expect(validateSession({ ...good, city: null, lat: null, lng: null, countryCode: 'JP' })?.countryCode).toBe('JP');
  });
  it('has exactly the documented fields', () => {
    expect([...SESSION_FIELDS].sort()).toEqual(['city', 'countryCode', 'done', 'lat', 'lng', 'month', 'radius', 'tab', 'types', 'v', 'verifiedOnly']);
  });
  it('keeps verifiedOnly on and off', () => {
    expect(validateSession({ ...good, verifiedOnly: false })?.verifiedOnly).toBe(false);
    expect(validateSession({ ...good, verifiedOnly: true })?.verifiedOnly).toBe(true);
  });
  it('migrates an exact version 1 record to version 3 with verifiedOnly off and every type on', () => {
    expect(validateSession(goodV1)).toEqual({ ...good, verifiedOnly: false, types: ALL_ON });
  });
  it('migrates an exact version 2 record to version 3 with every type on (verifiedOnly kept)', () => {
    expect(validateSession(goodV2)).toEqual({ ...good, types: ALL_ON });
    expect(validateSession({ ...goodV2, verifiedOnly: false })?.verifiedOnly).toBe(false);
  });
  it('keeps each quest type on and off', () => {
    expect(validateSession({ ...good, types: { free: false, discount: false, past: false } })?.types).toEqual({ free: false, discount: false, past: false });
    expect(validateSession({ ...good, types: ALL_ON })?.types).toEqual(ALL_ON);
  });
  it.each([
    ['extra field', { ...good, email: 'a@b.c' }],
    ['missing field', (({ done: _d, ...rest }) => rest)(good)],
    ['wrong version', { ...good, v: 4 }],
    ['version as string', { ...good, v: '3' }],
    ['types missing (v3)', (({ types: _x, ...rest }) => rest)(good)],
    ['types null', { ...good, types: null }],
    ['types as array', { ...good, types: [true, true, true] }],
    ['types with an extra key', { ...good, types: { ...ALL_ON, admin: true } }],
    ['types missing a key', { ...good, types: { free: true, discount: true } }],
    ['types value as string', { ...good, types: { ...ALL_ON, free: 'true' } }],
    ['types value as number', { ...good, types: { ...ALL_ON, past: 1 } }],
    ['types prototype-polluting', { ...good, types: JSON.parse('{"__proto__":{"x":1},"free":true,"discount":true,"past":true}') }],
    ['v2 record with types', { ...goodV2, types: ALL_ON }],
    ['v2 record without verifiedOnly', (({ verifiedOnly: _x, ...rest }) => rest)(goodV2)],
    ['v2 record with bad verifiedOnly', { ...goodV2, verifiedOnly: 'no' }],
    ['version 0', { ...good, v: 0 }],
    ['verifiedOnly missing (v2)', (({ verifiedOnly: _x, ...rest }) => rest)(good)],
    ['verifiedOnly as string', { ...good, verifiedOnly: 'true' }],
    ['verifiedOnly as number', { ...good, verifiedOnly: 1 }],
    ['verifiedOnly null', { ...good, verifiedOnly: null }],
    ['v1 record with verifiedOnly', { ...goodV1, verifiedOnly: true }],
    ['v1 record with an extra field', { ...goodV1, extra: 1 }],
    ['v1 record with bad city', { ...goodV1, city: '<b>' }],
    ['HTML in city', { ...good, city: '<img src=x onerror=alert(1)>' }],
    ['angle bracket in city', { ...good, city: 'Pune >' }],
    ['bidi override in city', { ...good, city: `Pune${String.fromCodePoint(0x202e)}` }],
    ['control char in city', { ...good, city: 'Pu\u0000ne' }],
    ['untrimmed city', { ...good, city: ' Pune' }],
    ['empty city', { ...good, city: '' }],
    ['overlong city', { ...good, city: 'x'.repeat(201) }],
    ['city without coords', { ...good, lat: null }],
    ['coords without city', { ...good, city: null }],
    ['city without country', { ...good, countryCode: null }],
    ['lat out of range', { ...good, lat: 91 }],
    ['lng NaN', { ...good, lng: Number.NaN }],
    ['lat as string', { ...good, lat: '18.5' }],
    ['lowercase country', { ...good, countryCode: 'in' }],
    ['month 13', { ...good, month: 13 }],
    ['month 1.5', { ...good, month: 1.5 }],
    ['radius not an option', { ...good, radius: 7000 }],
    ['unknown tab', { ...good, tab: 'admin' }],
    ['done not an array', { ...good, done: 'starbucks-in' }],
    ['done with bad id', { ...good, done: ['<script>'] }],
    ['done with duplicate', { ...good, done: ['a', 'a'] }],
    ['done too long', { ...good, done: Array.from({ length: 501 }, (_, i) => `id-${i}`) }],
    ['array', [good]],
    ['null', null],
    ['prototype-polluting', JSON.parse('{"__proto__":{"x":1}}')],
  ])('rejects %s', (_name, raw) => {
    expect(validateSession(raw)).toBeNull();
  });
});

describe('parseSession', () => {
  it('rejects non-JSON, oversized and empty input', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('')).toBeNull();
    expect(parseSession('{not json')).toBeNull();
    expect(parseSession(JSON.stringify({ ...good, city: 'x'.repeat(20_000) }))).toBeNull();
    expect(parseSession(JSON.stringify(good))).toEqual(good);
  });
});

describe('load / save / clear', () => {
  it('round-trips through one key only', () => {
    const store = memStore();
    expect(saveSession(good, store)).toBe(true);
    expect([...store.data.keys()]).toEqual([SESSION_KEY]);
    expect(JSON.parse(store.data.get(SESSION_KEY) ?? '')).toEqual(good);
    expect(loadSession(store)).toEqual(good);
    clearSession(store);
    expect(store.length).toBe(0);
    expect(loadSession(store)).toBeNull();
  });
  it('never writes an invalid record, and removes the old one instead', () => {
    const store = memStore();
    saveSession(good, store);
    expect(saveSession({ ...good, city: '<b>x</b>' }, store)).toBe(false);
    expect(store.length).toBe(0);
  });
  it('loads a version 1 record as version 3 (verifiedOnly off, every type on)', () => {
    const store = memStore();
    store.setItem(SESSION_KEY, JSON.stringify(goodV1));
    expect(loadSession(store)).toEqual({ ...good, verifiedOnly: false, types: ALL_ON });
  });
  it('loads a version 2 record as version 3 (every type on)', () => {
    const store = memStore();
    store.setItem(SESSION_KEY, JSON.stringify(goodV2));
    expect(loadSession(store)).toEqual({ ...good, types: ALL_ON });
  });
  it('removes a record whose types were tampered with', () => {
    const store = memStore();
    store.setItem(SESSION_KEY, JSON.stringify({ ...good, types: { ...ALL_ON, extra: false } }));
    expect(loadSession(store)).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });
  it('removes a record whose verifiedOnly was tampered with', () => {
    const store = memStore();
    store.setItem(SESSION_KEY, JSON.stringify({ ...good, verifiedOnly: 'yes' }));
    expect(loadSession(store)).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });
  it('removes a tampered record on load', () => {
    const store = memStore();
    store.setItem(SESSION_KEY, JSON.stringify({ ...good, extra: 1 }));
    expect(loadSession(store)).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });
  it('survives storage that throws (blocked storage)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    expect(loadSession(throwing)).toBeNull();
    expect(saveSession(good, throwing)).toBe(false);
    expect(() => clearSession(throwing)).not.toThrow();
    expect(loadSession(null)).toBeNull();
    expect(saveSession(good, null)).toBe(false);
  });
});
