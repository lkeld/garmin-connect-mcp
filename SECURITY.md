# Security policy

## Reporting

Do not open a public issue containing Garmin credentials, tokens, health data, private API responses, or a reproducible account takeover. Use the repository owner's private security-reporting channel. Redact all account identifiers and authentication material.

## Security model

- Connector OAuth uses `oidc-provider`, mandatory S256 PKCE, DCR, short-lived JWT access tokens and rotating refresh tokens.
- Garmin access/refresh tokens are encrypted with AES-256-GCM and bound with per-account authenticated data.
- Garmin passwords exist only in the sign-in request/worker memory and are never intentionally logged or persisted.
- Pending MFA state is encrypted, bound to the interaction and CSRF token, and expires after ten minutes.
- Connector bearer tokens and Garmin bearer tokens are separate. Claude never receives Garmin tokens.
- Every MCP request verifies issuer, audience, signature, expiry and continued existence of the account mapping.
- Disconnect deletes the account's encrypted token row. Old connector tokens then fail account validation.
- API URLs are restricted to the expected Garmin API/ECG hosts for the selected region. Arbitrary SSRF targets, path traversal and credential-bearing URLs are rejected.
- Database and application ports are private by default. Cloudflare Tunnel is the only intended public ingress.

## Operational requirements

Production operators must:

1. Use HTTPS and keep `BASE_URL` exact, including the `/mcp` resource URL.
2. Protect `.env`, database backups and the encryption/signing keys. Rotate application secrets only with a migration plan.
3. Keep Node, Python, `curl_cffi`, `oidc-provider`, the MCP SDK, container images and the host patched.
4. Restrict shell/database access and review Cloudflare logs/settings for accidental query or response logging.
5. Leave raw API passthrough disabled unless its additional policy risk is understood.
6. Keep writes disabled for users/deployments that only need analysis.
7. Monitor authentication failures and Garmin 429s without recording credentials or health payloads.
8. Test token deletion, OAuth redirect validation, tenant isolation and database restoration before launch.
9. Publish the operator's real privacy contact, subprocessors, jurisdiction, retention and incident-response process.
10. Obtain any required Garmin approval before public multi-user operation.

## Scope limitations

Deleting local tokens does not prove remote revocation at Garmin. Encryption at rest does not prevent a malicious or compromised operator from reading tokens or health responses in process memory. Users must trust the operator, Claude and the infrastructure providers, or self-host.

The private Garmin API and SSO flow may change at any time. Automated login can encounter CAPTCHA, region blocks or rate limits; the connector must not bypass CAPTCHA or attempt to evade account controls.
