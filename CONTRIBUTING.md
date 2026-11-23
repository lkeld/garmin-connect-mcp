# Contributing

## Principles

1. Do not persist health/activity payloads or Garmin passwords.
2. Do not expose Garmin access/refresh tokens, MFA cookies or connector signing keys to MCP clients.
3. Treat private endpoint mappings as dated compatibility data, not official Garmin contracts.
4. Use semantic read/write/destructive flags; HTTP verbs alone are insufficient.
5. Keep raw passthrough disabled by default and GraphQL on the read-only root-field allowlist.
6. Sanitize every fixture. Never commit real credentials, token stores, profile IDs, GPS tracks or health data.

## Development

```sh
npm ci
python3 -m venv auth-worker/.venv
auth-worker/.venv/bin/pip install -r auth-worker/requirements.txt
npm run check
```

Run PostgreSQL and the app with Docker Compose. `.env` is ignored and the secret generator refuses to overwrite it.

## Adding or updating an endpoint

1. Capture the source and date without including account data or credentials.
2. Add/update the definition in `src/garmin/catalog.ts`: ID, category, method, path, query definitions/defaults, path parameters, body type, semantic safety flags and verification provenance.
3. Add runtime handling only where request shaping, composite calls, chunking or downloads require it in `src/garmin/operations.ts`.
4. Update `docs/API_COVERAGE.md`, including accurate counts and explicit gaps.
5. Add synthetic tests for path encoding, required/default query values, write confirmation and output limits as appropriate.
6. Run `npm run check` and the synthetic OAuth/MCP smoke test.

Do not mark an operation live-verified unless that exact request was actually observed and the evidence can be described safely. Reference verification and this project’s verification are different fields for a reason.

## Security changes

Changes to login, MFA, OAuth callbacks, encryption, token refresh, account deletion, host allowlists, GraphQL policy or raw passthrough require tests and explicit review. Include threat scenarios and prove secrets are absent from logs/results.

Report vulnerabilities privately per [SECURITY.md](SECURITY.md), not in a public issue.
