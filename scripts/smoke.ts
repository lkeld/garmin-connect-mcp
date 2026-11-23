import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const base = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const fullAuth = process.env.SMOKE_AUTH === '1';
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const jar = new Map<string, string>();

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
  const response = await fetch(new URL(path, `${base}/`), { ...init, headers, redirect: 'manual' });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const index = pair?.indexOf('=') ?? -1;
    if (pair && index > 0) {
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value) jar.set(name, value); else jar.delete(name);
    }
  }
  return response;
}

function hidden(html: string, name: string): string {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`));
  assert(match?.[1], `Missing form field ${name}`);
  return match[1].replaceAll('&amp;', '&');
}

async function location(path: string, init?: RequestInit): Promise<string> {
  const response = await request(path, init);
  assert(response.status === 303, `Expected 303 for ${path}, got ${response.status}: ${await response.text()}`);
  const target = response.headers.get('location');
  assert(target, `Missing Location for ${path}`);
  return target;
}

async function postForm(path: string, values: Record<string, string>, bearer?: string): Promise<Response> {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: new URLSearchParams(values),
  });
}

async function mcp(token: string | undefined, body: Record<string, unknown>): Promise<Response> {
  return request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

const ready = await request('/health/ready');
assert(ready.status === 200, 'Readiness failed');
const unauthenticated = await mcp(undefined, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
assert(unauthenticated.status === 401, 'Unauthenticated MCP did not return 401');
assert(unauthenticated.headers.get('www-authenticate')?.includes('resource_metadata='), 'Missing resource_metadata challenge');
const resource = await (await request('/.well-known/oauth-protected-resource/mcp')).json();
assert(resource.resource === `${base}/mcp`, 'Protected resource URL mismatch');
const discovery = await (await request('/.well-known/oauth-authorization-server')).json();
assert(discovery.code_challenge_methods_supported.includes('S256'), 'S256 not advertised');
console.log('Public health, protected-resource metadata and OAuth discovery passed');

if (fullAuth) {
  const badRegistration = await request('/reg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://evil.example/callback'] }) });
  assert(badRegistration.status === 400, 'Disallowed OAuth redirect was accepted');
  const registrationResponse = await request('/reg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Synthetic MCP smoke test', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }) });
  if (registrationResponse.status !== 201) throw new Error(`DCR failed: ${await registrationResponse.text()}`);
  const client = await registrationResponse.json();
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  const authQuery = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri, response_type: 'code', scope: 'garmin:read offline_access', code_challenge: challenge, code_challenge_method: 'S256', resource: `${base}/mcp`, state });
  let target = await location(`/auth?${authQuery}`);
  let page = await request(target);
  assert(page.status === 200, `Login page failed: ${page.status}`);
  let html = await page.text();
  const loginToken = hidden(html, 'form_token');
  const uid = target.split('/').pop();
  target = await location(`/interaction/${uid}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'synthetic@example.invalid', password: 'not-a-real-password', region: 'global', form_token: loginToken }) });
  target = await location(target);
  page = await request(target);
  assert(page.status === 200, `Consent page failed: ${page.status}`);
  html = await page.text();
  assert(html.includes('I consent to AI processing'), 'AI consent disclosure missing');
  const consentToken = hidden(html, 'form_token');
  const consentUid = target.split('/').pop();
  const missingAiConsent = await postForm(`/interaction/${consentUid}/confirm`, { permission: 'read', form_token: consentToken });
  assert(missingAiConsent.status === 400, 'Consent succeeded without AI-processing acknowledgement');
  target = await location(`/interaction/${consentUid}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ permission: 'read', ai_consent: 'yes', form_token: consentToken }) });
  const callback = await location(target);
  const callbackUrl = new URL(callback);
  assert(callbackUrl.origin + callbackUrl.pathname === redirectUri, 'OAuth callback mismatch');
  assert(callbackUrl.searchParams.get('state') === state, 'OAuth state mismatch');
  const code = callbackUrl.searchParams.get('code');
  assert(code, 'Authorization code missing');

  const tokenResponse = await postForm('/token', { grant_type: 'authorization_code', client_id: client.client_id, code, redirect_uri: redirectUri, code_verifier: verifier, resource: `${base}/mcp` });
  if (tokenResponse.status !== 200) throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
  const tokens = await tokenResponse.json();
  assert(tokens.access_token && tokens.refresh_token, `Access or refresh token missing (fields: ${Object.keys(tokens).join(',')}; scope: ${tokens.scope})`);
  await jwtVerify(tokens.access_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), { issuer: base, audience: `${base}/mcp`, algorithms: ['ES256'] });
  const initialized = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'synthetic-smoke', version: '1.0.0' } } });
  if (initialized.status !== 200) {
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString('utf8'));
    throw new Error(`MCP initialize failed (${initialized.status}); claims=${JSON.stringify({ iss: claims.iss, aud: claims.aud, sub: claims.sub, scope: claims.scope, client_id: claims.client_id })}`);
  }
  const toolsResponse = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
  const tools = await toolsResponse.json();
  assert(toolsResponse.status === 200 && tools.result.tools.length >= 15, `Tool listing failed: ${JSON.stringify(tools)}`);
  const statusResponse = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'garmin_connection_status', arguments: {} } });
  const status = await statusResponse.json();
  assert(status.result?.content?.[0]?.text?.includes('"connected": true'), 'Synthetic account not connected');

  const refreshedResponse = await postForm('/token', { grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tokens.refresh_token, resource: `${base}/mcp` });
  if (refreshedResponse.status !== 200) throw new Error(`Refresh failed: ${await refreshedResponse.text()}`);
  const refreshed = await refreshedResponse.json();
  assert(refreshed.refresh_token && refreshed.refresh_token !== tokens.refresh_token, 'Refresh token did not rotate');
  const reused = await postForm('/token', { grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tokens.refresh_token, resource: `${base}/mcp` });
  assert(reused.status === 400, 'Old refresh token was accepted after rotation');

  const disconnectedResponse = await mcp(refreshed.access_token, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'garmin_disconnect', arguments: { confirmation: 'DISCONNECT' } } });
  const disconnected = await disconnectedResponse.json();
  assert(disconnected.result?.content?.[0]?.text?.includes('"disconnected":true') || disconnected.result?.content?.[0]?.text?.includes('"disconnected": true'), 'Disconnect tool failed');
  const afterDelete = await mcp(refreshed.access_token, { jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} });
  assert(afterDelete.status === 401, 'Deleted account still accepted connector bearer token');

  jar.clear();
  const mfaVerifier = randomBytes(48).toString('base64url');
  const mfaChallenge = createHash('sha256').update(mfaVerifier).digest('base64url');
  const mfaState = randomBytes(16).toString('base64url');
  const mfaAuthQuery = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri, response_type: 'code', scope: 'garmin:read offline_access', code_challenge: mfaChallenge, code_challenge_method: 'S256', resource: `${base}/mcp`, state: mfaState });
  let mfaTarget = await location(`/auth?${mfaAuthQuery}`);
  let mfaPage = await request(mfaTarget);
  const mfaLoginToken = hidden(await mfaPage.text(), 'form_token');
  const mfaUid = mfaTarget.split('/').pop();
  const challengeResponse = await postForm(`/interaction/${mfaUid}/login`, { username: 'mfa@example.invalid', password: 'not-a-real-password', region: 'global', form_token: mfaLoginToken });
  assert(challengeResponse.status === 202, `MFA challenge missing: ${challengeResponse.status}`);
  const challengeHtml = await challengeResponse.text();
  assert(challengeHtml.includes('Two-step verification'), 'MFA page not rendered');
  const challengeId = hidden(challengeHtml, 'challenge_id');
  const challengeCsrf = hidden(challengeHtml, 'csrf');
  mfaTarget = await location(`/interaction/${mfaUid}/mfa`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: '123456', challenge_id: challengeId, csrf: challengeCsrf }) });
  mfaTarget = await location(mfaTarget);
  mfaPage = await request(mfaTarget);
  const mfaConsentHtml = await mfaPage.text();
  const mfaConsentToken = hidden(mfaConsentHtml, 'form_token');
  const mfaConsentUid = mfaTarget.split('/').pop();
  mfaTarget = await location(`/interaction/${mfaConsentUid}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ permission: 'read', ai_consent: 'yes', form_token: mfaConsentToken }) });
  const mfaCallback = new URL(await location(mfaTarget));
  assert(mfaCallback.searchParams.get('state') === mfaState, 'MFA OAuth state mismatch');
  const mfaCode = mfaCallback.searchParams.get('code');
  assert(mfaCode, 'MFA authorization code missing');
  const mfaTokenResponse = await postForm('/token', { grant_type: 'authorization_code', client_id: client.client_id, code: mfaCode, redirect_uri: redirectUri, code_verifier: mfaVerifier, resource: `${base}/mcp` });
  assert(mfaTokenResponse.status === 200, 'MFA token exchange failed');
  const mfaTokens = await mfaTokenResponse.json();
  const deleted = await request('/account', { method: 'DELETE', headers: { Authorization: `Bearer ${mfaTokens.access_token}` } });
  assert(deleted.status === 204, 'Authenticated account deletion failed');
  console.log('DCR, PKCE login/MFA/AI consent, code exchange, MCP tools, refresh rotation and disconnect passed');
}
