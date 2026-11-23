import type { AccountStore } from '../accounts.js';
import { GarminAuth, GarminAuthError } from './auth.js';
import type { GarminAccount, Region, TokenSet } from './types.js';

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];
export type Query = Record<string, QueryValue>;

export type GarminRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Query;
  body?: unknown;
  rawBody?: string;
  formData?: FormData;
  headers?: Record<string, string>;
  response: 'json' | 'binary';
  retryOn401?: boolean;
};

export type GarminResponse = {
  status: number;
  contentType: string;
  buffer: Buffer;
};

export class GarminApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code = 'api_error', readonly retryAfter?: string) {
    super(message);
    this.name = 'GarminApiError';
  }
}

const locks = new Map<string, Promise<TokenSet>>();

export function domainFor(region: Region): string {
  return region === 'china' ? 'garmin.cn' : 'garmin.com';
}

export function resolveGarminUrl(region: Region, path: string, query: Query = {}): URL {
  const domain = domainFor(region);
  let url: URL;
  if (path.startsWith('https://')) {
    url = new URL(path);
    if (![ `connectapi.${domain}`, `ghs.${domain}` ].includes(url.host)) throw new GarminApiError('Only Garmin Connect API and ECG hosts are allowed', 400, 'invalid_path');
    if (url.username || url.password || url.search || url.hash) throw new GarminApiError('Put query values in the query argument, not the path', 400, 'invalid_path');
  } else {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#') || path.includes('\\')) {
      throw new GarminApiError('Path must be a clean absolute API path', 400, 'invalid_path');
    }
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { throw new GarminApiError('Invalid path encoding', 400, 'invalid_path'); }
    if (decoded.split('/').some((segment) => segment.split(';', 1)[0] === '..') || decoded.includes('\\')) {
      throw new GarminApiError('Path traversal is not allowed', 400, 'invalid_path');
    }
    url = new URL(`https://connectapi.${domain}${path}`);
  }
  for (const [key, raw] of Object.entries(query)) {
    if (raw === null || raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) url.searchParams.append(key, String(value));
  }
  return url;
}

function nativeHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'GCM-Android-5.23',
    'X-Garmin-User-Agent': 'com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0',
    'X-Garmin-Paired-App-Version': '10861',
    'X-Garmin-Client-Platform': 'Android',
    'X-App-Ver': '10861',
    'X-Lang': 'en',
    'X-GCExperience': 'GC5',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

async function readLimited(response: Response, maximum = 25 * 1024 * 1024): Promise<Buffer> {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > maximum) throw new GarminApiError(`Garmin response exceeds the ${maximum}-byte safety limit`, 502, 'response_too_large');
  if (!response.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new GarminApiError(`Garmin response exceeds the ${maximum}-byte safety limit`, 502, 'response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function safeErrorDetail(buffer: Buffer): string {
  try {
    const value = JSON.parse(buffer.toString('utf8')) as Record<string, unknown>;
    const detail = value.message ?? value.content ?? value.error;
    if (typeof detail === 'string') return detail.slice(0, 500);
    if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message.slice(0, 500);
  } catch { /* never reflect an HTML challenge or arbitrary body */ }
  return '';
}

export class GarminGateway {
  constructor(private readonly accounts: AccountStore, private readonly auth: GarminAuth) {}

  private async refresh(account: GarminAccount): Promise<TokenSet> {
    const existingLock = locks.get(account.id);
    if (existingLock) return existingLock;
    const promise = (async () => {
      try {
        const updated = await this.auth.refresh(account.tokens, account.region);
        await this.accounts.replaceTokens(account.id, updated);
        return updated;
      } catch (error) {
        if (error instanceof GarminAuthError && error.code === 'reauth_required') await this.accounts.delete(account.id);
        throw error;
      } finally {
        locks.delete(account.id);
      }
    })();
    locks.set(account.id, promise);
    return promise;
  }

  private async currentAccount(accountId: string, forceRefresh = false): Promise<GarminAccount> {
    const account = await this.accounts.get(accountId);
    if (!account) throw new GarminApiError('Garmin is not connected. Reconnect the connector and sign in again.', 401, 'reauth_required');
    if (forceRefresh || account.tokens.expiresAt * 1000 < Date.now() + 5 * 60_000) {
      account.tokens = await this.refresh(account);
    }
    return account;
  }

  async request(accountId: string, input: GarminRequest): Promise<GarminResponse> {
    const account = await this.currentAccount(accountId);
    const response = await this.send(account, input);
    if (response.status === 401 && (input.retryOn401 ?? (input.method ?? 'GET') === 'GET')) {
      const refreshed = await this.currentAccount(accountId, true);
      const retry = await this.send(refreshed, input);
      return this.validate(retry);
    }
    return this.validate(response);
  }

  async profile(accountId: string): Promise<Record<string, unknown>> {
    const response = await this.request(accountId, { path: '/userprofile-service/socialProfile', response: 'json' });
    return JSON.parse(response.buffer.toString('utf8')) as Record<string, unknown>;
  }

  async today(accountId: string): Promise<string> {
    let timeZone = 'UTC';
    try {
      const profile = await this.profile(accountId);
      const displayName = profile.displayName;
      if (typeof displayName === 'string' && displayName) {
        const response = await this.request(accountId, {
          path: `/userprofile-service/userprofile/personal-information/${encodeURIComponent(displayName)}`,
          response: 'json',
        });
        const info = JSON.parse(response.buffer.toString('utf8')) as Record<string, unknown>;
        const userInfo = info.userInfo && typeof info.userInfo === 'object' ? info.userInfo as Record<string, unknown> : {};
        const candidate = info.timeZone ?? userInfo.timeZone;
        if (typeof candidate === 'string' && candidate) timeZone = candidate;
      }
    } catch { /* UTC fallback avoids failing a date-only request on profile metadata */ }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private async send(account: GarminAccount, input: GarminRequest): Promise<GarminResponse> {
    const method = input.method ?? 'GET';
    const url = resolveGarminUrl(account.region, input.path, input.query);
    const headers = nativeHeaders(account.tokens.accessToken);
    const allowedHeaders = new Set(['accept', 'content-type', 'range', 'nk', 'di-backend', 'connect-csrf-token']);
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (allowedHeaders.has(name.toLowerCase())) headers[name] = value;
    }
    if (input.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const requestBody = input.formData ?? input.rawBody ?? (input.body === undefined ? undefined : JSON.stringify(input.body));
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        redirect: 'error',
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      if (error instanceof GarminApiError) throw error;
      throw new GarminApiError('Could not reach Garmin Connect', 502, 'upstream_unavailable');
    }
    return { status: response.status, contentType: response.headers.get('content-type') ?? 'application/octet-stream', buffer: await readLimited(response) };
  }

  private validate(response: GarminResponse): GarminResponse {
    if (response.status < 400) return response;
    if (response.status === 401) throw new GarminApiError('Garmin rejected the session. Reconnect your Garmin account.', 401, 'reauth_required');
    if (response.status === 403) throw new GarminApiError('Garmin denied this request (the feature may be unavailable or the network may be blocked)', 403, 'forbidden');
    if (response.status === 404) throw new GarminApiError('Garmin could not find this resource or your account does not have this feature', 404, 'not_found');
    if (response.status === 429) throw new GarminApiError('Garmin rate-limited this request; retry later', 429, 'rate_limited');
    const detail = safeErrorDetail(response.buffer);
    throw new GarminApiError(`Garmin returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status);
  }
}
