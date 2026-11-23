# Research and product decisions

**Snapshot:** 23 November 2026. This is a dated source review, not a Garmin security audit or permission to use private endpoints.

## Primary references

- [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/)
- [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- [Enterprise Program FAQ](https://developer.garmin.com/gc-developer-program/enterprise/program-faq/)
- [Official Health API](https://developer.garmin.com/gc-developer-program/enterprise/health-api/)
- [Official Activity API](https://developer.garmin.com/gc-developer-program/enterprise/activity-api/)
- [Garmin Developer Program Agreement](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf)
- [Claude: build an MCP server](https://claude.com/docs/connectors/building)
- [Claude: connector authentication](https://claude.com/docs/connectors/building/authentication)
- [MCP authorization specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [python-garminconnect source](https://github.com/cyberjunky/python-garminconnect/tree/82bc11073b597d20f8b080b7aeaac8d4cef4fc3e), commit `82bc11073b597d20f8b080b7aeaac8d4cef4fc3e`, 31 October 2026
- [That repository's endpoint comparison](https://github.com/cyberjunky/python-garminconnect/blob/82bc11073b597d20f8b080b7aeaac8d4cef4fc3e/docs/API_ENDPOINTS.md), based on its October 2026 web-app review

The upstream project is MIT licensed. It is used as a dated endpoint/auth reference only. This repository implements its own connector, SSO worker, token store, API gateway and MCP tools; it does not import or execute `python-garminconnect`.

## Official API versus Connect app API

Garmin's Developer Program has Personal, Starter Business and Enterprise Business paths. The Personal API is for an individual's own data and is not a general multi-user consumer OAuth service. Business access requires Garmin approval. The official APIs do not expose every feature in the Connect app.

The private Connect app/web API provides much broader coverage: activities, wellness, training, nutrition, women's health, ECG, courses, golf, gear, devices, achievements and account settings. It is undocumented for third-party use, can change without notice, may be blocked by region/device/subscription, and can trigger anti-automation controls.

This project therefore uses the private app API for compatibility and does not duplicate the narrower official Personal API. It does not claim that private API coverage is official, stable or permanently complete.

## Authentication findings

The current reference uses **native DI OAuth2**, not the historical `garth` OAuth1/OAuth2 token files:

1. Load the mobile or portal Garmin SSO page and its cookies.
2. Submit credentials to Garmin SSO; handle MFA when requested.
3. Receive a service ticket.
4. Exchange it at `https://diauth.garmin.com/di-oauth2-service/oauth/token` using the service-ticket grant.
5. Receive bearer access and refresh tokens.
6. Refresh using the real JWT `exp`/token response; never assume a fixed lifetime.
7. Verify against `/userprofile-service/socialProfile`.

This is not a public Authorization Code + PKCE flow offered to arbitrary consumer apps. A hosted connector cannot redirect to Garmin and avoid handling the password unless Garmin provisions a supported integration. The browser-facing connector OAuth flow (Claude ↔ this service) is separate and does use authorization codes, PKCE, DCR, rotating refresh tokens and audience-restricted access tokens.

## Contractual and launch constraints

The Developer Program Agreement reviewed during research restricts collection of Garmin login credentials and alternative authorization systems without written approval. It also imposes duties for third-party data transfer and AI processing. The exact applicability to an unofficial open-source/private-API service requires legal review; an MIT license in this repository grants no Garmin API rights.

**Decision:** build and validate a private staging deployment first. Do not describe public hosting as Garmin-approved. Obtain written Garmin approval and legal/privacy review before operating a general public multi-user service. Users who cannot accept the hosted credential model should self-host or use a local-only variant.

## MCP requirements implemented

- Streamable HTTP at `/mcp`.
- HTTP 401 with `WWW-Authenticate: Bearer resource_metadata=...` before authentication.
- RFC 9728 protected-resource metadata, with `resource` exactly matching the MCP URL.
- OAuth authorization-server discovery.
- Dynamic Client Registration for Claude custom connectors.
- S256 PKCE required.
- Rotating refresh tokens and one-hour, audience-restricted connector access tokens.
- Claude hosted callback `https://claude.ai/api/mcp/auth_callback`; loopback callbacks for Claude Code/MCP clients are a deployment policy concern.
- Tool responses are capped below Claude's hosted size limit.

## Threat-model decisions

- Semantic read/write flags matter more than HTTP verbs: at least one Garmin GET has a side effect.
- Known operations use a declarative allowlist. Raw API passthrough is optional and off by default for hosted deployments.
- GraphQL must be operation-allowlisted; an unrestricted GraphQL proxy is not a safe feature contract.
- Every non-read operation needs the `garmin:write` grant and an explicit per-call confirmation. Destructive operations have a distinct confirmation.
- Garmin text, activity names and notes are untrusted data, not instructions to the model.
- No Garmin access token, refresh token, password or MFA cookie is ever exposed as an MCP argument or result.
- Response size, upstream size, request rate and request paths are bounded.

## Coverage language

“Supported” means there is a source-mapped operation that our direct client can call. It does **not** mean it was tested against every Garmin account, device or region. The coverage document distinguishes upstream live verification from our own test status. No mobile app traffic was captured for this implementation.
