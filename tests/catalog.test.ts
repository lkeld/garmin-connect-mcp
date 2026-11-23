import { describe, expect, it } from 'vitest';
import { ENDPOINTS, ENDPOINT_MAP, CATEGORIES } from '../src/garmin/catalog.js';

describe('endpoint catalog integrity', () => {
  it('has unique IDs and broad source-mapped coverage', () => {
    expect(ENDPOINTS.length).toBe(353);
    expect(new Set(ENDPOINTS.map((endpoint) => endpoint.id)).size).toBe(ENDPOINTS.length);
    expect(new Set(ENDPOINTS.map((endpoint) => endpoint.category)).size).toBe(CATEGORIES.length);
    expect(ENDPOINTS.filter((endpoint) => endpoint.write)).toHaveLength(73);
    expect(ENDPOINTS.filter((endpoint) => endpoint.download)).toHaveLength(11);
  });
  it('declares every path placeholder and safe path form', () => {
    for (const endpoint of ENDPOINTS) {
      const placeholders = new Set([...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).filter((name) => name !== 'domain'));
      expect(new Set(endpoint.pathParams.filter((name) => name !== 'domain')), endpoint.id).toEqual(placeholders);
      expect(endpoint.path.startsWith('/') || endpoint.path.startsWith('https://ghs.{domain}/'), endpoint.id).toBe(true);
      expect(endpoint.destructive && !endpoint.write, endpoint.id).toBe(false);
      expect(endpoint.body === 'download' && !endpoint.download, endpoint.id).toBe(false);
      expect(ENDPOINT_MAP[endpoint.id]).toBe(endpoint);
    }
  });
  it('uses semantic write flags rather than HTTP verb assumptions', () => {
    expect(ENDPOINT_MAP.schedule_training_plan).toMatchObject({ method: 'GET', write: true, destructive: false });
    expect(ENDPOINT_MAP.search_training_plans).toMatchObject({ method: 'POST', write: false });
    expect(ENDPOINT_MAP.convert_activity_to_course).toMatchObject({ method: 'GET', write: false });
  });
  it('uses date sentinel defaults only on date parameters', () => {
    for (const endpoint of ENDPOINTS) {
      for (const [name, parameter] of Object.entries(endpoint.params)) {
        if (parameter.default === 'today' || parameter.default === '{startDate}') expect(parameter.type, `${endpoint.id}.${name}`).toBe('date');
      }
    }
  });
});
