import type { AccountStore } from '../accounts.js';
import type { Config } from '../config.js';
import type { ConnectorIdentity } from '../oauth/provider.js';
import { GarminApiError, type GarminGateway, type Query, type QueryValue } from './client.js';
import { ENDPOINT_MAP, type EndpointDefinition, type QueryParameterDefinition } from './catalog.js';
import { validateGarminGraphql } from './graphql.js';

export type OperationInput = {
  pathParams?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  confirmation?: string;
  fields?: string[];
  offset?: number;
  maxBytes?: number;
};

export type OperationOutput = {
  operation: string;
  status: number;
  data?: unknown;
  download?: { contentType: string; totalBytes: number; offset: number; nextOffset: number | null; base64: string };
};

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(date: string, days: number): string {
  if (!datePattern.test(date)) throw new Error('Dates must use YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeParameter(value: unknown, definition: QueryParameterDefinition, name: string): QueryValue {
  if (value === null || value === undefined) return undefined;
  switch (definition.type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      throw new Error(`${name} must be a boolean`);
    case 'integer': {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be an integer`);
      return parsed;
    }
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
      return parsed;
    }
    case 'date':
      if (typeof value !== 'string' || !datePattern.test(value)) throw new Error(`${name} must use YYYY-MM-DD`);
      shiftDate(value, 0);
      return value;
    case 'string[]':
    case 'integer[]': {
      const values = Array.isArray(value) ? value : [value];
      if (definition.type === 'string[]') {
        if (values.some((entry) => !['string', 'number'].includes(typeof entry))) throw new Error(`${name} must be an array of strings`);
        return values.map(String);
      }
      return values.map((entry) => {
        const parsed = Number(entry);
        if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must contain integers`);
        return parsed;
      });
    }
    default:
      if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`${name} must be a scalar query value`);
      return String(value);
  }
}

export class OperationRunner {
  constructor(private readonly gateway: GarminGateway, private readonly accounts: AccountStore, private readonly config: Config) {}

  definition(id: string): EndpointDefinition {
    const definition = ENDPOINT_MAP[id];
    if (!definition) throw new Error(`Unknown operation “${id}”. Use garmin_list_endpoints or garmin_get_endpoint_help.`);
    return definition;
  }

  private checkPermission(identity: ConnectorIdentity, definition: EndpointDefinition, confirmation?: string): void {
    if (!definition.write) return;
    if (!this.config.enableWrites) throw new Error('Garmin writes are disabled on this server');
    if (!identity.scopes.has('garmin:write')) throw new Error('This connection is read-only. Reconnect and explicitly approve read/write access.');
    const expected = definition.destructive ? `DELETE ${definition.id}` : `WRITE ${definition.id}`;
    if (confirmation !== expected) throw new Error(`This operation changes Garmin data. Set confirmation to exactly “${expected}” after the user approves it.`);
  }

  private async query(definition: EndpointDefinition, supplied: Record<string, unknown>, accountId: string): Promise<Query> {
    const query: Query = {};
    const passThrough = ['search_activities', 'search_training_plans'].includes(definition.id);
    for (const key of Object.keys(supplied)) {
      if (!passThrough && !definition.params[key]) throw new Error(`Unknown query parameter “${key}” for ${definition.id}`);
    }
    const names = new Set([...Object.keys(definition.params), ...(passThrough ? Object.keys(supplied) : [])]);
    for (const name of names) {
      const parameter = definition.params[name] ?? { type: 'unknown', required: false };
      let value = Object.hasOwn(supplied, name) ? supplied[name] : parameter.default;
      if (value === 'today') value = await this.gateway.today(accountId);
      if (value === '{startDate}') value = query.startDate ?? supplied.startDate;
      if (value === null || value === undefined) {
        if (parameter.required && parameter.default === undefined && !Object.hasOwn(supplied, name)) throw new Error(`Missing required query parameter “${name}” for ${definition.id}`);
        continue;
      }
      query[name] = normalizeParameter(value, parameter, name);
    }
    return query;
  }

  private async path(definition: EndpointDefinition, supplied: Record<string, unknown>, accountId: string): Promise<string> {
    const values: Record<string, unknown> = { ...supplied };
    const account = await this.accounts.get(accountId);
    if (!account) throw new GarminApiError('Garmin is not connected', 401, 'reauth_required');
    values.domain = account.region === 'china' ? 'garmin.cn' : 'garmin.com';
    if (definition.path.includes('{displayName}') || definition.path.includes('{userProfileNumber}')) {
      const profile = await this.gateway.profile(accountId);
      values.displayName = profile.displayName;
      values.userProfileNumber = profile.profileId;
    }
    if (definition.path.includes('{date}') && values.date === undefined && /date.*defaults? to today|defaults? to today/i.test(definition.notes)) values.date = await this.gateway.today(accountId);
    if (definition.path.includes('{end}') && values.end === undefined && /end defaults? to today/i.test(definition.notes)) values.end = await this.gateway.today(accountId);
    if (values.weeks === undefined && /weeks defaults? to 52/i.test(definition.notes)) values.weeks = 52;
    if (values.months === undefined && /months defaults? to 12/i.test(definition.notes)) values.months = 12;
    if (values.days === undefined && /days defaults? to 7/i.test(definition.notes)) values.days = 7;
    if (values.cycles === undefined) values.cycles = 6;
    if (values.firstDayOfWeek === undefined) values.firstDayOfWeek = 1;
    if (definition.id === 'get_calendar_week') {
      const date = String(values.date ?? await this.gateway.today(accountId));
      shiftDate(date, 0);
      values.year = Number(date.slice(0, 4));
      values.month = Number(date.slice(5, 7)) - 1;
      values.day = Number(date.slice(8, 10));
    }
    if (definition.id === 'get_scheduled_workouts' && values.month !== undefined) values.month = Number(values.month) - 1;
    if (['get_weekly_weight', 'get_weekly_blood_pressure'].includes(definition.id)) {
      const end = String(values.end ?? await this.gateway.today(accountId));
      values.end = end;
      values.start = shiftDate(end, -363);
    }
    if (definition.id === 'set_daily_goal' && typeof values.goalType === 'string' && values.goalType !== 'WEIGHT_GRAMS') values.goalType = values.goalType.toLowerCase().replaceAll('_', '-');
    return definition.path.replace(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g, (_match, name: string) => {
      const value = values[name];
      if (value === undefined || value === null || value === '') throw new Error(`Missing required path parameter “${name}” for ${definition.id}`);
      if (['date', 'start', 'end', 'startDate'].includes(name) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) shiftDate(String(value), 0);
      return encodeURIComponent(String(value));
    });
  }

  private async requestBody(definition: EndpointDefinition, input: OperationInput, accountId: string): Promise<Pick<Parameters<GarminGateway['request']>[1], 'body' | 'rawBody' | 'formData' | 'headers'>> {
    if (definition.id === 'query_garmin_graphql') {
      const body = asRecord(input.body);
      if (typeof body.query !== 'string') throw new Error('GraphQL body must include a query string');
      validateGarminGraphql(body.query);
      return { body };
    }
    if (definition.body === 'json') {
      let body = input.body ?? {};
      if (definition.id === 'update_user_settings') {
        const current = await this.gateway.request(accountId, { path: '/userprofile-service/userprofile/user-settings', response: 'json' });
        const existing = JSON.parse(current.buffer.toString('utf8')) as Record<string, unknown>;
        const updates = asRecord(body);
        body = { ...existing, ...updates };
        if (existing.userData && updates.userData) (body as Record<string, unknown>).userData = { ...asRecord(existing.userData), ...asRecord(updates.userData) };
      }
      if (definition.id === 'reschedule_workout') {
        const scheduleId = input.pathParams?.scheduledWorkoutId;
        if (scheduleId === undefined) throw new Error('scheduledWorkoutId is required');
        const current = await this.gateway.request(accountId, { path: `/workout-service/schedule/${encodeURIComponent(String(scheduleId))}`, response: 'json' });
        body = { ...JSON.parse(current.buffer.toString('utf8')), ...asRecord(body) };
      }
      return { body };
    }
    if (definition.body === 'text') {
      if (typeof input.body !== 'string' && typeof input.body !== 'number') throw new Error(`${definition.id} requires a text body`);
      return { rawBody: String(input.body), headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
    }
    if (definition.body === 'form') {
      const entries = Object.entries(asRecord(input.body)).map(([key, value]): [string, string] => [key, String(value)]);
      return { rawBody: new URLSearchParams(entries).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
    }
    if (definition.body === 'multipart') {
      const body = asRecord(input.body);
      if (typeof body.fileBase64 !== 'string' || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(body.fileBase64)) throw new Error('Multipart operations require fileBase64');
      const bytes = Buffer.from(body.fileBase64, 'base64');
      if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) throw new Error('Upload must be between 1 byte and 25 MiB');
      const filename = String(body.filename ?? 'upload.fit').split('/').pop()?.replace(/[\r\n"]/g, '').slice(0, 128) || 'upload.fit';
      const contentType = typeof body.contentType === 'string' ? body.contentType.slice(0, 100) : 'application/octet-stream';
      const form = new FormData();
      const field = definition.id === 'import_activity' ? 'userfile' : 'file';
      form.append(field, new Blob([bytes], { type: contentType }), filename);
      return { formData: form };
    }
    return {};
  }

  async run(identity: ConnectorIdentity, id: string, input: OperationInput = {}): Promise<OperationOutput> {
    const definition = this.definition(id);
    this.checkPermission(identity, definition, input.confirmation);
    const path = await this.path(definition, input.pathParams ?? {}, identity.accountId);
    const query = await this.query(definition, input.query ?? {}, identity.accountId);
    const body = await this.requestBody(definition, input, identity.accountId);
    const response = await this.gateway.request(identity.accountId, {
      method: definition.method,
      path,
      query,
      response: definition.download ? 'binary' : 'json',
      retryOn401: !definition.write && definition.method === 'GET',
      ...body,
    });
    if (definition.download || response.contentType.includes('application/octet-stream') || response.contentType.includes('application/vnd.garmin')) {
      const offset = Math.max(0, Math.floor(input.offset ?? 0));
      const maximum = Math.min(96 * 1024, Math.floor((this.config.maxToolResponseChars - 4000) * 3 / 4), Math.max(1024, Math.floor(input.maxBytes ?? 64 * 1024)));
      const total = response.buffer.length;
      if (offset > total) throw new Error(`Offset ${offset} exceeds download size ${total}`);
      const end = Math.min(total, offset + maximum);
      return {
        operation: id,
        status: response.status,
        download: {
          contentType: response.contentType,
          totalBytes: total,
          offset,
          nextOffset: end < total ? end : null,
          base64: response.buffer.subarray(offset, end).toString('base64'),
        },
      };
    }
    if (response.buffer.length === 0) return { operation: id, status: response.status, data: null };
    let data: unknown;
    try { data = JSON.parse(response.buffer.toString('utf8')); } catch { data = response.buffer.toString('utf8'); }
    if (input.fields?.length) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('fields can only select top-level keys from an object response');
      data = Object.fromEntries(input.fields.map((field) => [field, (data as Record<string, unknown>)[field]]).filter(([, value]) => value !== undefined));
    }
    return { operation: id, status: response.status, data };
  }
}
