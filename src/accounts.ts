import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import type { SecretBox } from './crypto.js';
import { hashToken, hashesEqual, randomToken } from './crypto.js';
import { tokenSetSchema, type GarminAccount, type GarminSubject, type LoginChallengeState, type Region, type TokenSet } from './garmin/types.js';

export class AccountStore {
  constructor(private readonly db: Database, private readonly secrets: SecretBox) {}

  async save(login: GarminSubject): Promise<string> {
    const subjectHash = this.secrets.subjectHash(login.subject);
    const existing = await this.db.pool.query<{ id: string }>('SELECT id FROM garmin_accounts WHERE subject_hash = $1', [subjectHash]);
    const id = existing.rows[0]?.id ?? randomUUID();
    const encrypted = this.secrets.encryptJson(login.tokens, `garmin-tokens:${id}`);
    await this.db.pool.query(
      `INSERT INTO garmin_accounts (id, subject_hash, region, encrypted_tokens)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET encrypted_tokens = EXCLUDED.encrypted_tokens, region = EXCLUDED.region, updated_at = now()`,
      [id, subjectHash, login.region, encrypted],
    );
    return id;
  }

  async get(id: string): Promise<GarminAccount | null> {
    const result = await this.db.pool.query<{ region: Region; encrypted_tokens: string }>(
      'SELECT region, encrypted_tokens FROM garmin_accounts WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id, region: row.region, tokens: tokenSetSchema.parse(this.secrets.decryptJson(row.encrypted_tokens, `garmin-tokens:${id}`)) };
  }

  async replaceTokens(id: string, tokens: TokenSet): Promise<void> {
    const encrypted = this.secrets.encryptJson(tokens, `garmin-tokens:${id}`);
    const result = await this.db.pool.query(
      'UPDATE garmin_accounts SET encrypted_tokens = $2, updated_at = now() WHERE id = $1',
      [id, encrypted],
    );
    if (!result.rowCount) throw new Error('Garmin account is no longer connected');
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.pool.query('DELETE FROM garmin_accounts WHERE id = $1', [id]);
    return Boolean(result.rowCount);
  }

  async markUsed(id: string): Promise<void> {
    await this.db.pool.query('UPDATE garmin_accounts SET last_used_at = now() WHERE id = $1', [id]);
  }

  async createMfaChallenge(interactionUid: string, state: LoginChallengeState): Promise<{ id: string; csrf: string }> {
    const id = randomUUID();
    const csrf = randomToken();
    const encrypted = this.secrets.encryptJson(state, `garmin-mfa:${id}`);
    await this.db.pool.query(
      `INSERT INTO garmin_login_challenges (id, interaction_uid, csrf_hash, encrypted_state, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [id, interactionUid, hashToken(csrf), encrypted],
    );
    return { id, csrf };
  }

  async useMfaChallenge(id: string, interactionUid: string, csrf: string): Promise<LoginChallengeState | null> {
    const result = await this.db.pool.query<{ interaction_uid: string; csrf_hash: string; encrypted_state: string }>(
      'SELECT interaction_uid, csrf_hash, encrypted_state FROM garmin_login_challenges WHERE id = $1 AND expires_at > now()',
      [id],
    );
    const row = result.rows[0];
    if (!row || row.interaction_uid !== interactionUid || !hashesEqual(row.csrf_hash, hashToken(csrf))) return null;
    return this.secrets.decryptJson<LoginChallengeState>(row.encrypted_state, `garmin-mfa:${id}`);
  }

  async deleteMfaChallenge(id: string): Promise<void> {
    await this.db.pool.query('DELETE FROM garmin_login_challenges WHERE id = $1', [id]);
  }
}
