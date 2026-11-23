import { existsSync } from 'node:fs';
import { z } from 'zod';

const httpsOrDevelopmentHttp = z.url();

const base64Key = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'Must be a base64-encoded 32-byte key',
});

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL: httpsOrDevelopmentHttp.default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('postgres://garmin:garmin@localhost:5432/garmin_mcp'),
  TOKEN_ENCRYPTION_KEY: base64Key,
  OIDC_COOKIE_KEYS: z.string().min(32),
  OIDC_JWKS: z.string().min(2),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  ENABLE_GARMIN_WRITES: z.string().default('false').transform((value) => value === 'true'),
  ENABLE_RAW_API: z.string().default('false').transform((value) => value === 'true'),
  AUTH_WORKER_PYTHON: z.string().optional(),
  AUTH_WORKER_PATH: z.string().default('auth-worker/worker.py'),
  AUTH_WORKER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(90_000),
  MAX_TOOL_RESPONSE_CHARS: z.coerce.number().int().min(10_000).max(140_000).default(120_000),
  EXTRA_OAUTH_REDIRECT_URIS: z.string().default(''),
});

export type Config = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  baseUrl: string;
  mcpUrl: string;
  databaseUrl: string;
  encryptionKey: Buffer;
  cookieKeys: string[];
  jwks: { keys: Record<string, unknown>[] };
  trustProxy: number;
  enableWrites: boolean;
  enableRawApi: boolean;
  authWorkerPython: string;
  authWorkerPath: string;
  authWorkerTimeoutMs: number;
  maxToolResponseChars: number;
  extraRedirectUris: string[];
}>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = configSchema.parse(env);
  const parsedBaseUrl = new URL(raw.BASE_URL);
  if (raw.NODE_ENV === 'production' && parsedBaseUrl.protocol !== 'https:') throw new Error('BASE_URL must use HTTPS in production');
  if (!['https:', ...(raw.NODE_ENV === 'production' ? [] : ['http:'])].includes(parsedBaseUrl.protocol)) throw new Error('BASE_URL must use HTTP(S)');
  if (raw.OIDC_COOKIE_KEYS.split(',').some((key) => key.trim().length < 32)) throw new Error('Every OIDC cookie key must be at least 32 characters');
  const baseUrl = raw.BASE_URL.replace(/\/$/, '');
  const jwks = JSON.parse(raw.OIDC_JWKS) as { keys?: Record<string, unknown>[] };
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.some((key) => key.d === undefined && key.k === undefined)) {
    throw new Error('OIDC_JWKS must contain at least one private signing key');
  }

  return Object.freeze({
    nodeEnv: raw.NODE_ENV,
    port: raw.PORT,
    baseUrl,
    mcpUrl: `${baseUrl}/mcp`,
    databaseUrl: raw.DATABASE_URL,
    encryptionKey: Buffer.from(raw.TOKEN_ENCRYPTION_KEY, 'base64'),
    cookieKeys: raw.OIDC_COOKIE_KEYS.split(',').map((key) => key.trim()).filter(Boolean),
    jwks: { keys: jwks.keys },
    trustProxy: raw.TRUST_PROXY,
    enableWrites: raw.ENABLE_GARMIN_WRITES,
    enableRawApi: raw.ENABLE_RAW_API,
    authWorkerPython: raw.AUTH_WORKER_PYTHON ?? (existsSync('auth-worker/.venv/bin/python') ? 'auth-worker/.venv/bin/python' : 'python3'),
    authWorkerPath: raw.AUTH_WORKER_PATH,
    authWorkerTimeoutMs: raw.AUTH_WORKER_TIMEOUT_MS,
    maxToolResponseChars: raw.MAX_TOOL_RESPONSE_CHARS,
    extraRedirectUris: raw.EXTRA_OAUTH_REDIRECT_URIS.split(',').map((uri) => uri.trim()).filter(Boolean),
  });
}
