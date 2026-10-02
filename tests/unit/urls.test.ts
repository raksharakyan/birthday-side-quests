import { describe, expect, it } from 'vitest';
import { directionsUrl, displayHost, safeHttpsUrl } from '../../src/urls';

describe('safeHttpsUrl', () => {
  it('accepts plain https URLs', () => {
    expect(safeHttpsUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
  });
  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:pass@example.com',
    'https://user@example.com',
    '//example.com',
    '/relative',
    '',
    '   ',
    'not a url',
  ])('rejects %s', (u) => {
    expect(safeHttpsUrl(u)).toBeNull();
  });
  it('rejects non-strings and overly long URLs', () => {
    expect(safeHttpsUrl(42)).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(`https://example.com/${'a'.repeat(3000)}`)).toBeNull();
  });
});

describe('directionsUrl', () => {
  it('builds a Google Maps directions link rounded to 6 dp', () => {
    expect(directionsUrl(12.9715987123, 77.5945627999)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12.971599,77.594563',
    );
  });
  it('clamps out-of-range coordinates', () => {
    expect(directionsUrl(100, -200)).toBe('https://www.google.com/maps/dir/?api=1&destination=90,-180');
  });
  it('throws on non-finite input', () => {
    expect(() => directionsUrl(Number.NaN, 0)).toThrow(RangeError);
    expect(() => directionsUrl(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('displayHost', () => {
  it('strips www.', () => expect(displayHost('https://www.example.com/x')).toBe('example.com'));
});
