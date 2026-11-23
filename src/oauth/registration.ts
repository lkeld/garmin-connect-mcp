import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type Provider from 'oidc-provider';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../config.js';

export function redirectAllowed(value: string, config: Pick<Config, 'extraRedirectUris'>): boolean {
  if (value === 'https://claude.ai/api/mcp/auth_callback' || config.extraRedirectUris.includes(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function registerDynamicClientRoute(app: Express, provider: Provider, config: Config): void {
  const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/reg', registrationLimiter, express.json({ limit: '32kb', strict: true }), async (req, res) => {
    try {
      if (!req.is('application/json')) return res.status(415).json({ error: 'invalid_request', error_description: 'Use application/json' });
      const input = req.body as Record<string, unknown>;
      if (!input || Array.isArray(input) || !Array.isArray(input.redirect_uris) || input.redirect_uris.length === 0 || input.redirect_uris.length > 10) {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'One to ten redirect_uris are required' });
      }
      if (input.redirect_uris.some((uri) => typeof uri !== 'string' || !redirectAllowed(uri, config))) {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'Redirect URI is not allowed for this connector' });
      }
      if (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== 'none') {
        return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Only public PKCE clients are accepted' });
      }
      const allowedScopes = new Set(['garmin:read', 'offline_access', ...(config.enableWrites ? ['garmin:write'] : [])]);
      const requestedScopes = typeof input.scope === 'string' ? input.scope.split(/\s+/).filter(Boolean) : [...allowedScopes];
      if (requestedScopes.some((scope) => !allowedScopes.has(scope))) {
        return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Requested client scope is not supported' });
      }
      const metadata: Record<string, unknown> = {
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: typeof input.client_name === 'string' ? input.client_name.slice(0, 120) : 'MCP client',
        redirect_uris: input.redirect_uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        id_token_signed_response_alg: 'ES256',
        application_type: 'native',
        scope: requestedScopes.join(' '),
      };
      const ClientModel = provider.Client as unknown as new (properties: Record<string, unknown>) => { clientId: string; metadata(): AdapterPayload };
      const client = new ClientModel(metadata);
      await (provider.Client as unknown as { adapter: Adapter }).adapter.upsert(client.clientId, client.metadata());
      res.status(201).json(client.metadata());
    } catch {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Client metadata could not be validated' });
    }
  });
}
