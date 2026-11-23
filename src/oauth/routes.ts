import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import type Provider from 'oidc-provider';
import { z } from 'zod';
import type { AccountStore } from '../accounts.js';
import type { Config } from '../config.js';
import type { GarminAuth } from '../garmin/auth.js';
import { regionSchema } from '../garmin/types.js';
import { consentPage, errorPage, loginPage, mfaPage } from '../views.js';

const body = urlencoded({ extended: false, limit: '12kb', parameterLimit: 20 });
const credentialsSchema = z.object({
  username: z.email().max(320),
  password: z.string().min(1).max(4096),
  region: regionSchema,
  form_token: z.string().min(1),
});
const mfaSchema = z.object({ code: z.string().trim().min(1).max(32), challenge_id: z.uuid(), csrf: z.string().min(1) });

function formToken(secret: string, uid: string): string {
  return createHmac('sha256', secret).update(`interaction-form-v1:${uid}`).digest('base64url');
}

function validFormToken(secret: string, uid: string, supplied: unknown): boolean {
  if (typeof supplied !== 'string') return false;
  const expected = Buffer.from(formToken(secret, uid));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

function redirectHost(params: Record<string, unknown>): string {
  try { return new URL(text(params.redirect_uri, '')).host || 'unknown'; } catch { return 'unknown'; }
}

function clientName(client: unknown, params: Record<string, unknown>): string {
  if (client && typeof client === 'object' && 'clientName' in client) {
    const name = client.clientName;
    if (typeof name === 'string' && name) return name;
  }
  return text(params.client_id, 'An MCP client');
}

export function registerInteractionRoutes(app: Express, provider: Provider, config: Config, accounts: AccountStore, garminAuth: GarminAuth): void {
  const secret = config.cookieKeys[0];
  if (!secret) throw new Error('At least one cookie key is required');
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
  const mfaLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });

  const renderLogin = async (req: Request, res: Response, error?: string, email?: string): Promise<void> => {
    const details = await provider.interactionDetails(req, res);
    const client = await provider.Client.find(text(details.params.client_id, ''));
    res.status(error ? 401 : 200).type('html').send(loginPage({
      uid: details.uid,
      token: formToken(secret, details.uid),
      clientName: clientName(client, details.params),
      redirectHost: redirectHost(details.params),
      ...(error ? { error } : {}),
      ...(email ? { email } : {}),
    }));
  };

  app.get('/interaction/:uid', async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name === 'login') return await renderLogin(req, res);
      if (details.prompt.name === 'consent') {
        const client = await provider.Client.find(text(details.params.client_id, ''));
        return res.type('html').send(consentPage({
          uid: details.uid,
          token: formToken(secret, details.uid),
          clientName: clientName(client, details.params),
          redirectHost: redirectHost(details.params),
          writeAvailable: config.enableWrites,
        }));
      }
      return res.status(400).type('html').send(errorPage());
    } catch (error) { return next(error); }
  });

  app.post('/interaction/:uid/login', loginLimiter, body, async (req, res, next) => {
    let email: string | undefined;
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name !== 'login' || !validFormToken(secret, details.uid, req.body?.form_token)) {
        return res.status(400).type('html').send(errorPage());
      }
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) return await renderLogin(req, res, 'Enter a valid Garmin email, password and region.');
      email = parsed.data.username;
      const result = await garminAuth.login(parsed.data.username, parsed.data.password, parsed.data.region);
      if (result.status === 'error') return await renderLogin(req, res, result.message, email);
      if (result.status === 'mfa') {
        const challenge = await accounts.createMfaChallenge(details.uid, result.state);
        return res.status(202).type('html').send(mfaPage({ uid: details.uid, challengeId: challenge.id, csrf: challenge.csrf, method: result.method }));
      }
      const accountId = await accounts.save({ subject: result.subject, tokens: result.tokens, region: parsed.data.region });
      return await provider.interactionFinished(req, res, { login: { accountId, remember: true, amr: ['pwd'] } }, { mergeWithLastSubmission: false });
    } catch (error) { return next(error); }
  });

  app.post('/interaction/:uid/mfa', mfaLimiter, body, async (req, res, next) => {
    let parsed: z.infer<typeof mfaSchema> | undefined;
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name !== 'login') return res.status(400).type('html').send(errorPage());
      const candidate = mfaSchema.safeParse(req.body);
      if (!candidate.success) return res.status(400).type('html').send(errorPage('Enter a valid verification code.'));
      parsed = candidate.data;
      const state = await accounts.useMfaChallenge(parsed.challenge_id, details.uid, parsed.csrf);
      if (!state) return res.status(400).type('html').send(errorPage('The Garmin verification session expired. Start again.'));
      const region = (state as { domain?: unknown }).domain === 'garmin.cn' ? 'china' : 'global';
      const result = await garminAuth.completeMfa(parsed.code, state, region);
      if (result.status === 'error') {
        return res.status(401).type('html').send(mfaPage({ uid: details.uid, challengeId: parsed.challenge_id, csrf: parsed.csrf, method: 'verification', error: result.message }));
      }
      if (result.status === 'mfa') return res.status(400).type('html').send(errorPage('Garmin requested another verification step. Start again.'));
      await accounts.deleteMfaChallenge(parsed.challenge_id);
      const accountId = await accounts.save({ subject: result.subject, tokens: result.tokens, region });
      return await provider.interactionFinished(req, res, { login: { accountId, remember: true, amr: ['pwd', 'mfa'] } }, { mergeWithLastSubmission: false });
    } catch (error) { return next(error); }
  });

  app.post('/interaction/:uid/confirm', body, async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name !== 'consent' || !details.session?.accountId || req.body?.ai_consent !== 'yes' || !validFormToken(secret, details.uid, req.body?.form_token)) {
        return res.status(400).type('html').send(errorPage());
      }
      let grant = details.grantId ? await provider.Grant.find(details.grantId) : undefined;
      if (!grant) grant = new provider.Grant({ accountId: details.session.accountId, clientId: text(details.params.client_id, '') });
      const prompt = details.prompt.details as {
        missingOIDCScope?: string[];
        missingOIDCClaims?: string[];
        missingResourceScopes?: Record<string, string[]>;
      };
      if (prompt.missingOIDCScope) grant.addOIDCScope(prompt.missingOIDCScope);
      if (prompt.missingOIDCClaims) grant.addOIDCClaims(prompt.missingOIDCClaims);
      const allowWrite = config.enableWrites && req.body?.permission === 'read_write';
      for (const [indicator, requested] of Object.entries(prompt.missingResourceScopes ?? {})) {
        const allowed = requested.filter((scope) => scope === 'garmin:read' || (allowWrite && scope === 'garmin:write'));
        const rejected = requested.filter((scope) => !allowed.includes(scope));
        if (allowed.length) grant.addResourceScope(indicator, allowed);
        if (rejected.length) grant.rejectResourceScope(indicator, rejected);
      }
      const grantId = await grant.save();
      const consent = details.grantId ? {} : { grantId };
      return await provider.interactionFinished(req, res, { consent }, { mergeWithLastSubmission: true });
    } catch (error) { return next(error); }
  });

  app.post('/interaction/:uid/cancel', body, async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (!validFormToken(secret, details.uid, req.body?.form_token)) return res.status(400).type('html').send(errorPage());
      return await provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'The user cancelled the Garmin connection' }, { mergeWithLastSubmission: false });
    } catch (error) { return next(error); }
  });
}
