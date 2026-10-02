import { describe, expect, it } from 'vitest';
import {
  clearSession, loadSession, parseSession, saveSession, SESSION_FIELDS, SESSION_KEY, validateSession, type SessionData,
} from '../../src/session';

const good: SessionData = {
  v: 1,
  city: 'Pune',
  lat: 18.5204,
  lng: 73.8567,
  countryCode: 'IN',
  month: 10,
  radius: 5000,
  tab: 'online',
  done: ['starbucks-in', 'nykaa-in'],
};

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
    expect([...SESSION_FIELDS].sort()).toEqual(['city', 'countryCode', 'done', 'lat', 'lng', 'month', 'radius', 'tab', 'v']);
  });
  it.each([
    ['extra field', { ...good, email: 'a@b.c' }],
    ['missing field', (({ done: _d, ...rest }) => rest)(good)],
    ['wrong version', { ...good, v: 2 }],
    ['version as string', { ...good, v: '1' }],
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
