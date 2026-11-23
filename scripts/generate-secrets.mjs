import { generateKeyPair, exportJWK } from 'jose';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const path = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../.env', import.meta.url));
try {
  await readFile(path, 'utf8');
  console.error('.env already exists; refusing to overwrite it');
  process.exit(1);
} catch (error) {
  if (!error || error.code !== 'ENOENT') throw error;
}

const { privateKey } = await generateKeyPair('ES256', { extractable: true });
const jwk = await exportJWK(privateKey);
Object.assign(jwk, { kid: `mcp-${randomBytes(8).toString('hex')}`, use: 'sig', alg: 'ES256' });
const env = [
  'NODE_ENV=production',
  'PORT=3000',
  `BASE_URL=${process.env.PUBLIC_BASE_URL ?? 'https://garmin.system.style'}`,
  'POSTGRES_DB=garmin_mcp',
  'POSTGRES_USER=garmin',
  `POSTGRES_PASSWORD=${randomBytes(32).toString('base64url')}`,
  'DATABASE_URL=postgres://garmin:${POSTGRES_PASSWORD}@db:5432/garmin_mcp',
  `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  `OIDC_COOKIE_KEYS=${randomBytes(32).toString('base64url')}`,
  `OIDC_JWKS=${JSON.stringify(JSON.stringify({ keys: [jwk] }))}`,
  'TRUST_PROXY=1',
  'ENABLE_GARMIN_WRITES=false',
  'ENABLE_RAW_API=false',
  'AUTH_WORKER_PYTHON=/opt/auth-venv/bin/python',
  'AUTH_WORKER_PATH=/app/auth-worker/worker.py',
  '# Set after `cloudflared tunnel create` / Cloudflare dashboard:',
  '# CLOUDFLARE_TUNNEL_TOKEN=',
  '',
].join('\n');
await writeFile(path, env, { mode: 0o600 });
await chmod(path, 0o600);
console.log(`Created ${path} with new encryption, cookie, database and OIDC signing secrets. Back it up securely.`);
