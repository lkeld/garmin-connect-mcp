import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationRunner } from '../src/garmin/operations.js';
import type { GarminGateway } from '../src/garmin/client.js';
import type { AccountStore } from '../src/accounts.js';
import type { Config } from '../src/config.js';
import type { ConnectorIdentity } from '../src/oauth/provider.js';

const identity: ConnectorIdentity = { accountId: 'account-1', scopes: new Set(['garmin:read', 'garmin:write']) };
const jsonResponse = (value: unknown, contentType = 'application/json') => ({ status: 200, contentType, buffer: Buffer.from(JSON.stringify(value)) });

function fixture() {
  const gateway = {
    profile: vi.fn(async () => ({ displayName: 'name/with spaces', profileId: 42 })),
    today: vi.fn(async () => '2026-11-23'),
    request: vi.fn(async () => jsonResponse({ ok: true })),
  } as unknown as GarminGateway;
  const accounts = { get: async () => ({ id: 'account-1', region: 'global', tokens: {} }) } as unknown as AccountStore;
  const config = { enableWrites: true, enableRawApi: false, maxToolResponseChars: 120_000 } as Config;
  return { gateway, runner: new OperationRunner(gateway, accounts, config) };
}

describe('operation runtime', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and percent-encodes displayName without trusting profile text', async () => {
    const { gateway, runner } = fixture();
    await runner.run(identity, 'get_user_summary', { query: { calendarDate: '2026-11-23' } });
    expect(gateway.profile).toHaveBeenCalledOnce();
    expect(gateway.request).toHaveBeenCalledWith('account-1', expect.objectContaining({ path: '/usersummary-service/usersummary/daily/name%2Fwith%20spaces', query: { calendarDate: '2026-11-23' } }));
  });

  it('applies timezone-aware query defaults and rejects unknown parameters', async () => {
    const { gateway, runner } = fixture();
    await runner.run(identity, 'get_daily_sleep');
    expect(gateway.request).toHaveBeenCalledWith('account-1', expect.objectContaining({ query: { date: '2026-11-23', nonSleepBufferMinutes: 60 } }));
    await expect(runner.run(identity, 'get_daily_sleep', { query: { unexpected: true } })).rejects.toThrow('Unknown query parameter');
  });

  it('derives exact 52-week weight ranges', async () => {
    const { gateway, runner } = fixture();
    await runner.run(identity, 'get_weekly_weight');
    expect(gateway.request).toHaveBeenCalledWith('account-1', expect.objectContaining({ path: '/weight-service/weight/weeklyRange/2025-11-25/2026-11-23' }));
  });

  it('requires semantic write confirmation even for a side-effecting GET', async () => {
    const { gateway, runner } = fixture();
    const input = { pathParams: { planId: 123 }, query: { startDate: '2026-12-01' } };
    await expect(runner.run(identity, 'schedule_training_plan', input)).rejects.toThrow('WRITE schedule_training_plan');
    await runner.run(identity, 'schedule_training_plan', { ...input, confirmation: 'WRITE schedule_training_plan' });
    expect(gateway.request).toHaveBeenCalledWith('account-1', expect.objectContaining({ method: 'GET', path: '/trainingplan-service/trainingplan/schedule/123', retryOn401: false }));
  });

  it('uses a distinct destructive confirmation', async () => {
    const { runner } = fixture();
    await expect(runner.run(identity, 'delete_activity', { pathParams: { activityId: 5 }, confirmation: 'WRITE delete_activity' })).rejects.toThrow('DELETE delete_activity');
  });

  it('enforces read-only grants and server write policy', async () => {
    const { runner } = fixture();
    await expect(runner.run({ ...identity, scopes: new Set(['garmin:read']) }, 'set_primary_training_device', { body: { deviceId: 1 }, confirmation: 'WRITE set_primary_training_device' })).rejects.toThrow('read-only');
  });

  it('merges settings updates with current nested userData', async () => {
    const { gateway, runner } = fixture();
    vi.mocked(gateway.request)
      .mockResolvedValueOnce(jsonResponse({ userData: { measurementSystem: 'metric', sleepTime: 480 }, other: true }))
      .mockResolvedValueOnce({ status: 204, contentType: 'application/json', buffer: Buffer.alloc(0) });
    await runner.run(identity, 'update_user_settings', { body: { userData: { measurementSystem: 'statute' } }, confirmation: 'WRITE update_user_settings' });
    expect(gateway.request).toHaveBeenLastCalledWith('account-1', expect.objectContaining({ method: 'PUT', body: { userData: { measurementSystem: 'statute', sleepTime: 480 }, other: true } }));
  });

  it('chunks binary downloads without exceeding tool output limits', async () => {
    const { gateway, runner } = fixture();
    vi.mocked(gateway.request).mockResolvedValue({ status: 200, contentType: 'application/octet-stream', buffer: Buffer.alloc(200_000, 7) });
    const result = await runner.run(identity, 'download_activity.gpx', { pathParams: { activityId: 10 }, maxBytes: 96 * 1024 });
    expect(result.download?.nextOffset).not.toBeNull();
    expect(JSON.stringify(result).length).toBeLessThan(120_000);
    expect(result.download?.base64.length).toBe(Math.ceil((result.download?.nextOffset ?? 0) / 3) * 4);
  });
});
