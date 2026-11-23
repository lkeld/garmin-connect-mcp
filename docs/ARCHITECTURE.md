# Architecture

## Request paths

### Connector authentication

1. Claude POSTs to `/mcp` without a token and receives HTTP 401 with an RFC 9728 `resource_metadata` challenge.
2. Protected-resource metadata identifies the canonical MCP resource and this server’s OAuth issuer.
3. Claude dynamically registers a public client at `/reg`. Registration is restricted to authorization-code/refresh grants, supported scopes and allowed redirects.
4. `/auth` requires S256 PKCE. The server forces consent when `offline_access` is requested so refresh tokens are retained and the disclosure is always shown.
5. The interaction submits Garmin credentials through a one-shot Python auth worker over stdin/stdout. The worker uses Garmin mobile SSO first and portal SSO as fallback, handles MFA, exchanges the service ticket for DI OAuth2 tokens and verifies the profile.
6. Only the resulting tokens are encrypted and persisted. Passwords stay in transient process memory. Pending MFA cookies are encrypted for at most ten minutes.
7. Consent records read-only or read/write scope and requires an explicit AI-processing acknowledgement.
8. Claude exchanges the code with PKCE for a one-hour, ES256-signed JWT restricted to the exact `/mcp` audience, plus a rotating refresh token.

### MCP calls

1. `/mcp` verifies the JWT signature, issuer, audience, expiry, scope and continued account existence.
2. A stateless MCP server/transport is created for that account and request.
3. Common tools and `garmin_api_operation` resolve through the declarative endpoint catalog.
4. The runtime checks semantic read/write policy and confirmations, applies defaults, loads `displayName` only when needed, percent-encodes path parameters, validates query values and constructs JSON/text/form/multipart bodies.
5. The API gateway permits only `connectapi.<domain>` and `ghs.<domain>` for the selected region. It injects native bearer headers, refreshes Garmin tokens under a per-account lock, retries only idempotent GETs after a 401, bounds response size and sanitizes errors.
6. JSON is capped below Claude’s result limit. Downloads are returned as bounded base64 chunks and are not stored.

## Components

| Component | Responsibility |
|---|---|
| `src/server.ts` | HTTP surface, discovery, security headers, lifecycle |
| `src/oauth/*` | Authorization server, DCR policy, interactions, Postgres adapter, JWT verification |
| `src/garmin/auth.ts` + `auth-worker/worker.py` | Garmin SSO, MFA, DI exchange and refresh |
| `src/garmin/client.ts` | Authenticated Garmin HTTP, host/path controls, response limits, refresh locking |
| `src/garmin/catalog.ts` | Source-mapped operation definitions and safety metadata |
| `src/garmin/operations.ts` | Operation validation, defaults, body shaping, downloads |
| `src/mcp.ts` | MCP tools, resources, prompts and output handling |
| `src/accounts.ts` | Encrypted account tokens and expiring MFA challenges |
| `src/db.ts` | PostgreSQL pool, migrations and expiry cleanup |

## Persistence and tenant isolation

`garmin_accounts` uses a random UUID as the connector subject. A keyed HMAC of Garmin’s stable identifier reconnects the same account without storing the identifier itself. Token ciphertext uses that UUID as AES-GCM authenticated data, so rows cannot be swapped between accounts without decryption failing.

Every connector JWT carries the account UUID as `sub`. Verification loads that account on every request. Deleting the row therefore invalidates all outstanding connector tokens for Garmin access, even before their JWT expiry.

OAuth state uses a separate `oidc_payloads` table with model-scoped IDs, grant indexes, expiry and atomic consumption. Authorization-code replay and refresh-token reuse are rejected. Dynamic clients expire after 180 days.

The database has no public port. Application logs do not include request bodies, query strings, Garmin payloads or tokens.

## Deployment trust boundaries

- **Garmin:** private SSO and API services; availability and policy are outside this project’s control.
- **Claude/MCP client:** receives only user-requested tool output and its own connector token, never Garmin tokens.
- **Cloudflare:** public HTTPS/Tunnel ingress; must not cache or challenge OAuth/MCP routes.
- **Hetzner/host operator:** can access process memory and encryption keys and must be trusted.
- **PostgreSQL:** encrypted Garmin tokens plus OAuth state; database backups remain sensitive.

For stronger control, self-host the entire stack and hold your own keys. Open-source review does not prove a third-party operator’s behavior.

## Scaling considerations

The initial deployment is one application replica and one PostgreSQL instance. Garmin refresh locks are process-local; before running multiple replicas, move refresh serialization to PostgreSQL advisory locks and re-read the token row after acquiring the lock. Keep one replica until that is implemented and tested.

Use stateless MCP POST handling, so HTTP requests do not depend on a sticky MCP session. OIDC state itself is in PostgreSQL and can be shared once refresh locking is addressed. Apply rate limits at both the application and edge, and enforce per-account upstream concurrency/backoff before adding users.

## Known engineering follow-ups

- Live-test each region/auth strategy and supported MFA method using consented test accounts.
- Build fixtures from sanitized real responses for each endpoint family and device capability.
- Add composite convenience behavior where the catalog currently exposes the underlying request(s) instead.
- Add approved/sanitized mappings for social, nutrition administration and other documented app gaps.
- Move Garmin refresh locking to PostgreSQL before horizontal scaling.
- Publish operator-specific privacy, consent-record, incident-response and backup-retention policies.
