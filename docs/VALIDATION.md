# Validation record

## 23 November 2026 — local implementation checks

- TypeScript strict type-check: **passed**.
- Production build: **passed**.
- Unit/security/catalog/runtime tests: **31 passed** across 8 files.
- Production `npm audit`: **0 known vulnerabilities** at the time checked.
- Docker image build: **passed**.
- Docker Compose readiness and OAuth discovery: **passed**.
- Catalog: **353 unique IDs**, 17 categories, 73 writes and 11 download definitions.

The synthetic end-to-end smoke test passed:

1. Health/readiness and RFC 9728/OAuth discovery.
2. Rejection of a disallowed redirect during DCR.
3. Public-client registration and S256 PKCE authorization.
4. Synthetic Garmin login without real credentials.
5. Synthetic MFA challenge and completion.
6. Rejection of consent without explicit AI-processing acknowledgement.
7. Authorization-code exchange with signed access and refresh tokens.
8. Independent JWT signature verification and authenticated MCP initialization.
9. MCP tool listing and `garmin_connection_status` call.
10. Refresh-token rotation and rejection of the old token on reuse.
11. `garmin_disconnect`, authenticated account deletion and rejection of the old connector token afterward.

## 23 November 2026 — private Hetzner staging

The final source was deployed to a new isolated Compose project on the supplied server. Results:

- Application and PostgreSQL containers: **healthy**.
- Readiness endpoint: **passed**.
- Unauthenticated `/mcp`: **HTTP 401** as required.
- Protected resource: exactly **`https://garmin.system.style/mcp`**.
- With the public Host/forwarded-proto headers, OAuth authorization/token/registration endpoints all resolve to **`https://garmin.system.style`**.
- Only `127.0.0.1:3000` is exposed on the host; PostgreSQL has no host port.
- `ENABLE_GARMIN_WRITES=false` and `ENABLE_RAW_API=false` in the staging environment.
- Cloudflare Tunnel was not started because no Cloudflare credential is available in this environment.

## Not yet validated

- No real Garmin account, password, MFA delivery or token has been used.
- No live request has been made to Garmin from this implementation.
- No Cloudflare public hostname has been configured or tested.
- No claim is made that all 353 definitions work for every account, device, region or current Garmin deployment.
- Social and other explicitly documented app gaps have not been mapped.
- Multi-replica Garmin token refresh has not been tested; run one replica.

The `verified` values in the endpoint catalog refer to the dated upstream reference documentation, not this project’s synthetic tests.
