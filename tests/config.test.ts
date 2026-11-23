import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';

const environment = () => ({
  NODE_ENV: 'test',
  BASE_URL: 'http://localhost:3000',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  OIDC_COOKIE_KEYS: randomBytes(32).toString('base64url'),
  OIDC_JWKS: JSON.stringify({ keys: [{ kty: 'EC', crv: 'P-256', d: 'test-private-key' }] }),
});

describe('configuration', () => {
  it('uses safe read-only/raw-disabled defaults', () => {
    const config = loadConfig(environment());
    expect(config.enableWrites).toBe(false);
    expect(config.enableRawApi).toBe(false);
    expect(config.mcpUrl).toBe('http://localhost:3000/mcp');
  });
  it('rejects HTTP and short cookie keys in production', () => {
    expect(() => loadConfig({ ...environment(), NODE_ENV: 'production' })).toThrow('HTTPS');
    expect(() => loadConfig({ ...environment(), NODE_ENV: 'production', BASE_URL: 'https://garmin.example.com', OIDC_COOKIE_KEYS: 'short' })).toThrow('32 characters');
  });
  it('requires a private signing key and 32-byte encryption key', () => {
    expect(() => loadConfig({ ...environment(), OIDC_JWKS: '{"keys":[]}' })).toThrow('private signing key');
    expect(() => loadConfig({ ...environment(), TOKEN_ENCRYPTION_KEY: 'dG9vLXNob3J0' })).toThrow();
  });
});
