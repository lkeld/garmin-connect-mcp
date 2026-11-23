import pg from 'pg';

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
      CREATE TABLE IF NOT EXISTS garmin_accounts (
        id uuid PRIMARY KEY,
        subject_hash char(64) NOT NULL UNIQUE,
        region text NOT NULL CHECK (region IN ('global', 'china')),
        encrypted_tokens text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS garmin_login_challenges (
        id uuid PRIMARY KEY,
        interaction_uid text NOT NULL,
        csrf_hash char(64) NOT NULL,
        encrypted_state text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS garmin_login_challenges_expiry ON garmin_login_challenges(expires_at);
      CREATE TABLE IF NOT EXISTS oidc_payloads (
        model text NOT NULL,
        id text NOT NULL,
        payload jsonb NOT NULL,
        grant_id text,
        uid text,
        user_code text,
        expires_at timestamptz,
        consumed_at timestamptz,
        PRIMARY KEY (model, id)
      );
      CREATE INDEX IF NOT EXISTS oidc_payloads_grant ON oidc_payloads(grant_id) WHERE grant_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS oidc_payloads_uid ON oidc_payloads(uid) WHERE uid IS NOT NULL;
      CREATE INDEX IF NOT EXISTS oidc_payloads_user_code ON oidc_payloads(user_code) WHERE user_code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS oidc_payloads_expiry ON oidc_payloads(expires_at) WHERE expires_at IS NOT NULL;
    `,
  },
];

export class Database {
  readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'garmin-connect-mcp',
    });
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(741852963)');
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const migration of MIGRATIONS) {
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migration.id]);
        if (applied.rowCount) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      try { await client.query('SELECT pg_advisory_unlock(741852963)'); } catch { /* connection is closing */ }
      client.release();
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await Promise.all([
      this.pool.query('DELETE FROM garmin_login_challenges WHERE expires_at < now()'),
      this.pool.query('DELETE FROM oidc_payloads WHERE expires_at < now() - interval \'1 day\''),
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
