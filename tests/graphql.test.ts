import { describe, expect, it } from 'vitest';
import { validateGarminGraphql } from '../src/garmin/graphql.js';

describe('GraphQL allowlist', () => {
  it('accepts documented read-only dashboard operations', () => {
    expect(() => validateGarminGraphql('query { sleepScalar(date:"2026-11-23", sleepOnly:false) }')).not.toThrow();
    expect(() => validateGarminGraphql('query Q($date:String!) { healthStatusSummary(calendarDate:$date) { calendarDate } }')).not.toThrow();
  });
  it('rejects mutations, introspection and unknown root fields', () => {
    expect(() => validateGarminGraphql('mutation { deleteActivity }')).toThrow();
    expect(() => validateGarminGraphql('query { __schema { types { name } } }')).toThrow();
    expect(() => validateGarminGraphql('query { arbitraryPrivateAdminField }')).toThrow();
  });
  it('rejects multiple operations', () => {
    expect(() => validateGarminGraphql('query A { sleepScalar } query B { weightScalar }')).toThrow('exactly one');
  });
});
