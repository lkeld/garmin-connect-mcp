import { describe, expect, it } from 'vitest';
import { resolveGarminUrl } from '../src/garmin/client.js';

describe('Garmin URL validation', () => {
  it('builds global and China API URLs with encoded query values', () => {
    expect(resolveGarminUrl('global', '/sleep-service/sleep', { date: '2026-11-23', include: true }).href).toBe('https://connectapi.garmin.com/sleep-service/sleep?date=2026-11-23&include=true');
    expect(resolveGarminUrl('china', '/wellness-service/test').href).toBe('https://connectapi.garmin.cn/wellness-service/test');
  });
  it('permits only the ECG sibling host for full URLs', () => {
    expect(resolveGarminUrl('global', 'https://ghs.garmin.com/ghs/ecg/v1/ecg/123').host).toBe('ghs.garmin.com');
    expect(() => resolveGarminUrl('global', 'https://example.com/health')).toThrow('Only Garmin');
    expect(() => resolveGarminUrl('global', 'https://sso.garmin.com/login')).toThrow('Only Garmin');
    expect(() => resolveGarminUrl('global', 'https://ghs.garmin.com@example.com/path')).toThrow('Only Garmin');
  });
  it('rejects traversal, embedded queries, fragments and protocol-relative paths', () => {
    for (const path of ['/../admin', '/%2e%2e/admin', '/safe?admin=true', '/safe#fragment', '//example.com/path', '/safe\\..\\admin']) {
      expect(() => resolveGarminUrl('global', path)).toThrow();
    }
  });
  it('serializes array query parameters without allowing raw delimiters', () => {
    const url = resolveGarminUrl('global', '/activity', { sport: ['running', 'cycling'], search: 'a&admin=true' });
    expect(url.searchParams.getAll('sport')).toEqual(['running', 'cycling']);
    expect(url.searchParams.get('search')).toBe('a&admin=true');
    expect(url.searchParams.get('admin')).toBeNull();
  });
});
