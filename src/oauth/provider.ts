import { createLocalJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import Provider, { errors } from 'oidc-provider';
import type { AccountStore } from '../accounts.js';
import type { Config } from '../config.js';
import type { Database } from '../db.js';
import { PostgresOidcAdapter } from './adapter.js';

export type ConnectorIdentity = { accountId: string; scopes: Set<string>; clientId?: string };

export function createProvider(config: Config, db: Database): Provider {
  const scopes = config.enableWrites ? 'garmin:read garmin:write' : 'garmin:read';
  const provider = new Provider(config.baseUrl, {
    adapter: (name) => new PostgresOidcAdapter(db, name),
    jwks: config.jwks,
    clients: [],
    scopes: [...scopes.split(' '), 'offline_access'],
    responseTypes: ['code'],
    claims: { sub: null },
    findAccount: (_ctx, id) => ({
      accountId: id,
      claims: async () => ({ sub: id }),
    }),
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    features: {
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      registration: { enabled: true, initialAccessToken: false, issueRegistrationAccessToken: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.mcpUrl,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, resource) => {
          if (resource !== config.mcpUrl) throw new errors.InvalidTarget('Unknown MCP resource');
          return {
            scope: scopes,
            audience: config.mcpUrl,
            accessTokenFormat: 'jwt',
            accessTokenTTL: 3600,
            jwt: { sign: { alg: 'ES256' } },
          };
        },
      },
    },
    pkce: { required: () => true },
    cookies: {
      keys: config.cookieKeys,
      long: { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production' },
      short: { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production' },
    },
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 300,
      Interaction: 600,
      Session: 30 * 24 * 3600,
      RefreshToken: 90 * 24 * 3600,
      Grant: 90 * 24 * 3600,
    },
    rotateRefreshToken: true,
  });
  provider.proxy = config.trustProxy > 0;
  return provider;
}

export function publicJwkSet(jwks: Config['jwks']): { keys: Record<string, unknown>[] } {
  return {
    keys: jwks.keys.map((key) => {
      const publicKey = { ...key };
      for (const privateParameter of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']) delete publicKey[privateParameter];
      return publicKey;
    }),
  };
}

export function createTokenVerifier(config: Config, accounts: AccountStore) {
  const jwks = createLocalJWKSet(publicJwkSet(config.jwks));
  return async (authorization: string | undefined): Promise<ConnectorIdentity | null> => {
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice(7);
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.baseUrl,
        audience: config.mcpUrl,
        algorithms: ['ES256'],
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string' || typeof payload.scope !== 'string') return null;
      if (!await accounts.get(payload.sub)) return null;
      const identity: ConnectorIdentity = { accountId: payload.sub, scopes: new Set(payload.scope.split(' ')) };
      if (typeof payload.client_id === 'string') identity.clientId = payload.client_id;
      return identity;
    } catch (error) {
      if (error instanceof joseErrors.JOSEError) return null;
      throw error;
    }
  };
}
