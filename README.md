# Garmin Connect MCP

An open-source, multi-user **unofficial** Garmin Connect connector for Claude and other MCP clients. It provides a hosted Streamable HTTP endpoint with per-user OAuth, Garmin SSO/MFA support, encrypted token storage and a broad source-mapped Connect app API catalog.

> Not affiliated with, endorsed by, or approved by Garmin. Garmin’s private app API can change or become unavailable. Do not describe this connector as an official Garmin integration.

## What’s included

- **353 request definitions across 17 categories**, covering 280 non-write operations, 73 writes and 11 binary download definitions.
- Common tools for daily briefs, sleep, HRV, activities, nutrition, devices and training status.
- Searchable endpoint catalog and per-operation parameter/body help for the wider surface: wellness, ECG, women’s health, body composition, blood pressure, workouts, courses, training plans, calendar, gear, golf, achievements, reports and more.
- Garmin global (`garmin.com`) and China (`garmin.cn`) region selection.
- Garmin mobile/portal SSO, service-ticket → DI OAuth2 exchange, MFA and refresh-token handling implemented in this repository. `curl_cffi` is used only as the HTTP/TLS engine; `python-garminconnect` is **not** a runtime dependency.
- Multi-user OAuth 2.1 for MCP: DCR, mandatory S256 PKCE, explicit consent, one-hour audience-restricted JWT access tokens and rotating refresh tokens.
- AES-256-GCM encrypted Garmin access/refresh tokens. No Garmin password, health history or activity files are intentionally persisted.
- Read-only consent by default, optional write scope, exact per-call write/delete confirmations and semantic flags for side-effecting GETs.
- PostgreSQL persistence, Docker Compose deployment, private database networking and optional Cloudflare Tunnel ingress.
- Security/unit/catalog tests plus an end-to-end synthetic OAuth/MFA/MCP smoke test.

See **[API coverage](docs/API_COVERAGE.md)** for the complete endpoint inventory and its verification provenance.

## Important limitations

This is a broad implementation of the mapped Connect app API, not a guarantee of every Garmin app feature or every device/account. The reference project explicitly leaves some social/account-administration areas unmapped, including parts of comments, likes, followers, groups, inbox/newsfeed, invitations and some integrations. Nutrition search/custom-food administration, dashboard/UI preferences, Index scale setup and some dive/golf/animal-specific functions also need further mapping. These gaps are documented rather than hidden behind a “full compatibility” claim.

Garmin may return empty data or 403/404 for unsupported devices, regions, subscriptions or features. No live Garmin account has been used by the automated tests.

### Authorization and public-hosting caveat

Garmin does not offer a general consumer OAuth flow for these private app endpoints. A hosted connector must briefly handle the user’s Garmin password while submitting it to Garmin’s official SSO service; passwords are never stored. Users who do not accept that model should self-host.

Research also found contractual restrictions around collecting Garmin credentials, alternative authorization systems and third-party/AI processing. **Obtain written Garmin approval and legal/privacy review before operating a general public multi-user service.** The initial deployment is private staging, read-only by default. See [Research](docs/RESEARCH.md), [Security](SECURITY.md) and [Privacy & AI transparency](PRIVACY.md).

## Add to Claude

Once deployed with public HTTPS, add this as a custom connector under **Settings → Connectors → Add custom connector**:

```text
https://garmin.system.style/mcp
```

Claude will receive a 401 discovery challenge, discover OAuth, send the user through Garmin sign-in/MFA and explicit AI-processing consent, then use its own connector access token. Claude never receives the Garmin access or refresh tokens.

The server must be publicly reachable over HTTPS; Tailscale-only URLs cannot be used by Claude’s hosted apps. Tailscale is suitable for server administration.

## MCP tools

| Tool | Purpose |
|---|---|
| `garmin_daily_brief` | Summary, sleep, HRV, Body Battery and training data with partial-failure handling |
| `garmin_get_sleep`, `garmin_get_daily_summary`, `garmin_get_hrv_range` | Focused wellness queries |
| `garmin_list_activities`, `garmin_get_activity` | Activity search, metadata and bounded details |
| `garmin_get_nutrition`, `garmin_list_devices`, `garmin_get_training_status` | Other common queries |
| `garmin_list_endpoints`, `garmin_get_endpoint_help` | Discover all catalog operations and exact arguments |
| `garmin_api_operation` | Invoke a mapped read or explicitly confirmed write operation |
| `garmin_download` | Chunked base64 downloads with `nextOffset` continuation |
| `garmin_connection_status`, `garmin_disconnect` | Check status or delete the account’s local token mapping |
| `garmin_raw_request` | Optional advanced escape hatch; disabled by default |

Example operation arguments:

```json
{
  "operation": "get_hrv_data_range",
  "pathParams": { "start": "2026-11-01", "end": "2026-11-23" }
}
```

```json
{
  "operation": "set_primary_training_device",
  "body": { "deviceId": 123456 },
  "confirmation": "WRITE set_primary_training_device"
}
```

Only supply a write/delete confirmation after the user approves that specific action. `DELETE <operation>` is required for destructive operations.

## Quick start

Requirements: Node.js 22.18+, Docker with Compose, and Python 3 for the auth worker (installed in the container).

```sh
git clone https://github.com/lkeld/garmin-connect-mcp.git
cd garmin-connect-mcp
npm ci
npm run secrets          # creates .env once, mode 0600; never commit it
npm run check
docker compose up -d db app
curl -fsS http://127.0.0.1:3000/health/ready
```

For local development, change `.env` to:

```dotenv
NODE_ENV=development
BASE_URL=http://127.0.0.1:3000
DATABASE_URL=postgres://garmin:<your-postgres-password>@localhost:5432/garmin_mcp
AUTH_WORKER_PYTHON=python3
AUTH_WORKER_PATH=auth-worker/worker.py
```

Install the worker dependencies and start:

```sh
python3 -m venv auth-worker/.venv
auth-worker/.venv/bin/pip install -r auth-worker/requirements.txt
npm run dev
```

See **[Deployment](docs/DEPLOYMENT.md)** for the Hetzner/Cloudflare topology, DNS/tunnel setup, backups and updates.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` outside production | Canonical public origin; HTTPS required in production |
| `DATABASE_URL` | local PostgreSQL URL | Private database connection |
| `TOKEN_ENCRYPTION_KEY` | required | Base64-encoded 32-byte token-encryption key |
| `OIDC_COOKIE_KEYS` | required | Comma-separated cookie keys, each at least 32 characters |
| `OIDC_JWKS` | required | Private ES256 JWK Set used for connector JWTs |
| `ENABLE_GARMIN_WRITES` | `false` | Advertise/allow Garmin mutations |
| `ENABLE_RAW_API` | `false` | Enable arbitrary-path escape hatch (not recommended for public hosting) |
| `EXTRA_OAUTH_REDIRECT_URIS` | empty | Additional exact callbacks for other MCP clients |
| `TRUST_PROXY` | `1` | Trusted reverse-proxy hops |
| `MAX_TOOL_RESPONSE_CHARS` | `120000` | Cap below Claude’s hosted tool-result limit |

Keep the same `.env` and database volume across upgrades. Back them up separately and securely.

## Validation

```sh
npm run check
SMOKE_AUTH=0 npm run smoke       # public metadata checks against a running server
SMOKE_AUTH=1 npm run smoke       # full synthetic flow; requires mock worker setup
```

The full smoke test covers DCR, PKCE, Garmin login and MFA fixtures, required AI consent, code exchange, JWT verification, MCP initialization/tools, refresh rotation and account deletion. It does not contact Garmin or use real credentials. See [Validation](docs/VALIDATION.md).

## Data handling

- **Persisted:** encrypted Garmin tokens, a keyed hash of a stable account ID, region, timestamps, OAuth state and short-lived encrypted MFA state.
- **Not intentionally persisted:** Garmin passwords, names/emails, health/activity responses, GPS tracks, food logs, ECG data or downloaded files.
- **AI processing:** requested Garmin data is returned to Claude or another MCP client and processed by an AI system. Explicit consent is mandatory. Downstream retention is governed by that provider’s settings and terms.
- **Disconnect:** deletes local connector access. It does not delete Claude conversations or prove remote revocation at Garmin.

Read [PRIVACY.md](PRIVACY.md) before connecting an account or operating a public instance.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never include real Garmin credentials, tokens, health data or private responses in issues or tests.

MIT licensed. The endpoint map uses the MIT-licensed `python-garminconnect` project as a dated reference at commit `82bc11073b597d20f8b080b7aeaac8d4cef4fc3e`; no Garmin endorsement or private API rights are granted by that license or this one.
