import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';
import { loadConfig } from '../src/config.js';
import { createTokenVerifier, publicJwkSet } from '../src/oauth/provider.js';
import type { AccountStore } from '../src/accounts.js';

async function fixture() {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  Object.assign(jwk, { kid: 'unit-test-key', use: 'sig', alg: 'ES256' });
  const config = loadConfig({
    NODE_ENV: 'test', BASE_URL: 'http://localhost:3000',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), OIDC_COOKIE_KEYS: randomBytes(32).toString('base64url'),
    OIDC_JWKS: JSON.stringify({ keys: [jwk] }),
  });
  const accounts = { get: async (id: string) => ({ id }) } as unknown as AccountStore;
  const token = await new SignJWT({ scope: 'garmin:read', client_id: 'test-client' })
    .setSubject('account-123').setIssuer(config.baseUrl).setAudience(config.mcpUrl).setExpirationTime('5m')
    .setProtectedHeader({ alg: 'ES256', kid: 'unit-test-key' }).sign(await importJWK(jwk, 'ES256'));
  return { config, accounts, token };
}

describe('connector JWT verification', () => {
  it('derives public verification keys without private parameters', async () => {
    const { config, accounts, token } = await fixture();
    expect(publicJwkSet(config.jwks).keys[0]).not.toHaveProperty('d');
    const identity = await createTokenVerifier(config, accounts)(`Bearer ${token}`);
    expect(identity?.accountId).toBe('account-123');
    expect(identity?.scopes.has('garmin:read')).toBe(true);
  });
  it('rejects missing and malformed credentials', async () => {
    const { config, accounts } = await fixture();
    expect(await createTokenVerifier(config, accounts)(undefined)).toBeNull();
    expect(await createTokenVerifier(config, accounts)('Bearer not-a-jwt')).toBeNull();
  });
});
