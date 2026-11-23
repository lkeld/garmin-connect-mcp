import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { Database } from '../db.js';

type Row = { payload: AdapterPayload };

export class PostgresOidcAdapter implements Adapter {
  constructor(private readonly db: Database, private readonly model: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt = expiresIn === undefined
      ? (payload.exp ? new Date(payload.exp * 1000) : (this.model === 'Client' ? new Date(Date.now() + 180 * 24 * 3600_000) : null))
      : new Date(Date.now() + expiresIn * 1000);
    const values = [this.model, id, payload, payload.grantId ?? null, payload.uid ?? null, payload.userCode ?? null, expiresAt];
    if (this.model === 'ReplayDetection') {
      const inserted = await this.db.pool.query(
        `INSERT INTO oidc_payloads (model, id, payload, grant_id, uid, user_code, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (model, id) DO NOTHING RETURNING id`,
        values,
      );
      if (!inserted.rowCount) {
        const current = await this.db.pool.query('DELETE FROM oidc_payloads WHERE model = $1 AND id = $2 AND expires_at <= now() RETURNING id', [this.model, id]);
        if (current.rowCount) return this.upsert(id, payload, expiresIn);
        throw new Error('Replay detected');
      }
      return;
    }
    await this.db.pool.query(
      `INSERT INTO oidc_payloads (model, id, payload, grant_id, uid, user_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (model, id) DO UPDATE SET payload = EXCLUDED.payload,
         grant_id = EXCLUDED.grant_id, uid = EXCLUDED.uid, user_code = EXCLUDED.user_code,
         expires_at = EXCLUDED.expires_at`,
      values,
    );
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const result = await this.db.pool.query<Row>(
      'SELECT payload FROM oidc_payloads WHERE model = $1 AND id = $2 AND (expires_at IS NULL OR expires_at > now())',
      [this.model, id],
    );
    return result.rows[0]?.payload;
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const result = await this.db.pool.query<Row>(
      'SELECT payload FROM oidc_payloads WHERE model = $1 AND user_code = $2 AND (expires_at IS NULL OR expires_at > now())',
      [this.model, userCode],
    );
    return result.rows[0]?.payload;
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const result = await this.db.pool.query<Row>(
      'SELECT payload FROM oidc_payloads WHERE model = $1 AND uid = $2 AND (expires_at IS NULL OR expires_at > now())',
      [this.model, uid],
    );
    return result.rows[0]?.payload;
  }

  async consume(id: string): Promise<void> {
    const result = await this.db.pool.query(
      `UPDATE oidc_payloads SET consumed_at = now(), payload = jsonb_set(payload, '{consumed}', to_jsonb(now()))
       WHERE model = $1 AND id = $2 AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
      [this.model, id],
    );
    if (result.rowCount !== 1) throw new Error('Authorization artifact was already consumed or expired');
  }

  async destroy(id: string): Promise<void> {
    await this.db.pool.query('DELETE FROM oidc_payloads WHERE model = $1 AND id = $2', [this.model, id]);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.db.pool.query('DELETE FROM oidc_payloads WHERE model = $1 AND grant_id = $2', [this.model, grantId]);
  }
}
