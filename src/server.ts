import express, { type Express } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type Provider from 'oidc-provider';
import { AccountStore } from './accounts.js';
import { loadConfig, type Config } from './config.js';
import { SecretBox } from './crypto.js';
import { Database } from './db.js';
import { GarminAuth } from './garmin/auth.js';
import { GarminGateway } from './garmin/client.js';
import { createGarminMcpServer } from './mcp.js';
import { createProvider, createTokenVerifier, type ConnectorIdentity } from './oauth/provider.js';
import { registerInteractionRoutes } from './oauth/routes.js';
import { registerDynamicClientRoute } from './oauth/registration.js';
import { homePage, privacyPage, errorPage, styles } from './views.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export type Services = {
  db: Database;
  accounts: AccountStore;
  garminAuth: GarminAuth;
  gateway: GarminGateway;
  provider: Provider;
};

export function createApplication(config: Config, services: Services): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'none'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const verify = createTokenVerifier(config, services.accounts);
  const resourceMetadata = () => ({
    resource: config.mcpUrl,
    authorization_servers: [config.baseUrl],
    scopes_supported: config.enableWrites ? ['garmin:read', 'garmin:write'] : ['garmin:read'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${config.baseUrl}/privacy`,
    resource_name: 'Garmin Connect MCP',
  });
  const challenge = (res: express.Response, invalid = false): void => {
    const scope = config.enableWrites ? 'garmin:read garmin:write' : 'garmin:read';
    res.set('WWW-Authenticate', `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp", scope="${scope}"${invalid ? ', error="invalid_token"' : ''}`);
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Authentication required' }, id: null });
  };
  const authenticate = async (req: express.Request, res: express.Response): Promise<ConnectorIdentity | null> => {
    const identity = await verify(req.header('authorization'));
    if (!identity) { challenge(res, Boolean(req.header('authorization'))); return null; }
    if (!identity.scopes.has('garmin:read')) { challenge(res, true); return null; }
    return identity;
  };

  app.get('/', (_req, res) => res.type('html').send(homePage(config.mcpUrl)));
  app.get('/privacy', (_req, res) => res.type('html').send(privacyPage()));
  app.get('/assets/style.css', (_req, res) => res.type('text/css').set('Cache-Control', 'public, max-age=3600').send(styles));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    const healthy = await services.db.healthy();
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'unavailable' });
  });
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json(resourceMetadata()));

  const mcpLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/mcp', mcpLimiter, express.json({ limit: '40mb', strict: true }), async (req, res) => {
    const identity = await authenticate(req, res);
    if (!identity) return;
    const server = createGarminMcpServer({ identity, gateway: services.gateway, accounts: services.accounts, config });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP request failed' }, id: req.body?.id ?? null });
      console.error('MCP request error:', error instanceof Error ? error.message : 'unknown');
    }
  });
  app.all('/mcp', async (req, res) => {
    const identity = await authenticate(req, res);
    if (!identity) return;
    res.set('Allow', 'POST').status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'This stateless endpoint accepts MCP POST requests' }, id: null });
  });
  app.delete('/account', async (req, res) => {
    const identity = await authenticate(req, res);
    if (!identity) return;
    await services.accounts.delete(identity.accountId);
    res.status(204).end();
  });

  registerDynamicClientRoute(app, services.provider, config);
  registerInteractionRoutes(app, services.provider, config, services.accounts, services.garminAuth);
  app.use('/auth', (req, _res, next) => {
    if (req.method === 'GET') {
      const url = new URL(req.url, config.baseUrl);
      if (url.searchParams.get('scope')?.split(/\s+/).includes('offline_access') && !url.searchParams.has('prompt')) {
        url.searchParams.set('prompt', 'consent');
        req.url = `${url.pathname}${url.search}`;
      }
    }
    next();
  });
  app.use(services.provider.callback());
  app.use((req, res) => req.path.startsWith('/interaction/')
    ? res.status(404).type('html').send(errorPage())
    : res.status(404).json({ error: 'not_found' }));
  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error(`HTTP ${req.method} ${req.path}: ${name}`);
    if (req.path.startsWith('/interaction/')) res.status(400).type('html').send(errorPage());
    else res.status(500).json({ error: 'internal_error' });
  });
  return app;
}

export async function start(): Promise<void> {
  const config = loadConfig();
  const db = new Database(config.databaseUrl);
  await db.migrate();
  const accounts = new AccountStore(db, new SecretBox(config.encryptionKey));
  const garminAuth = new GarminAuth(config);
  const gateway = new GarminGateway(accounts, garminAuth);
  const provider = createProvider(config, db);
  const app = createApplication(config, { db, accounts, garminAuth, gateway, provider });
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Garmin Connect MCP listening on port ${config.port}; public URL ${config.mcpUrl}`));
  const cleanup = setInterval(() => { void db.cleanup().catch(() => undefined); }, 60 * 60_000);
  cleanup.unref();
  const shutdown = (): void => {
    clearInterval(cleanup);
    server.close(() => { void db.close().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error: unknown) => {
    console.error('Startup failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  });
}
