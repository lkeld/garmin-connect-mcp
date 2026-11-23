# Privacy and AI transparency

This is the project's reference policy. A public operator must publish their own identity, contact details, jurisdiction and any differences before launch.

## What passes through the service

When a user asks Claude to use the connector, the hosted service retrieves the requested Garmin data and returns it to the user's MCP client. This can include health metrics, sleep, nutrition, ECG, menstrual/pregnancy data, precise activity locations, devices, account profile details and historical records, depending on the request.

The service does not need or collect all Garmin data automatically. Requests are initiated through MCP tools. Limit date ranges and fields where possible.

## What is persisted

| Data | Retention | Purpose |
|---|---|---|
| Encrypted Garmin access and refresh tokens | Until disconnect, failed permanent reauthentication, or account deletion | Access Garmin on the user's behalf |
| Keyed hash of a stable Garmin account identifier | Same as token record | Reconnect the same account without storing email/name |
| Region (`global` or `china`) | Same as token record | Select Garmin service hosts |
| Encrypted pending MFA cookies/state | Maximum 10 minutes | Complete Garmin verification |
| OAuth clients, grants, sessions and short-lived codes | Per OAuth expiry; expired rows are cleaned periodically | Authenticate Claude and maintain consent |
| Account creation/update/last-use timestamps | Until account deletion | Operation and security |

The reference implementation does **not** intentionally persist Garmin passwords, names, email addresses, health responses, activity files, food logs, ECG waveforms, GPS tracks or MCP tool arguments/results.

## AI Transparency Statement

**Garmin data requested through this connector is transmitted to Claude or another MCP client and processed by an AI system to answer the user's prompts, analyze trends and generate summaries or recommendations.** The user must explicitly approve this during connection and can withdraw by disconnecting and deleting the connector in Claude.

The connector itself does not use health data to train models. Anthropic's own terms, privacy settings, retention and plan/enterprise arrangements govern downstream Claude processing; this project cannot promise that Anthropic retains no conversation data or never uses it for training. Users should review those settings and avoid sending data they do not want processed by an AI service.

AI-generated health analysis may be wrong and is not medical advice.

## Infrastructure and disclosure

A hosted deployment involves the user's MCP client/AI provider, Garmin, the hosting provider, the reverse-proxy/DNS provider and the service operator. For the proposed deployment these are Anthropic, Garmin, Hetzner and Cloudflare. Data may be processed in their respective jurisdictions. The operator must publish exact details and lawful transfer arrangements before public launch.

Open source makes the implementation auditable; it does not prove a particular deployment follows it. A hosting administrator with application/key access could read tokens and responses in memory. Self-hosting is the alternative for users who do not accept that trust model.

## Retention and deletion

The `garmin_disconnect` MCP tool and authenticated `DELETE /account` endpoint delete the stored Garmin token mapping. Existing connector tokens subsequently fail account validation. Users should also remove the custom connector in Claude and review any Claude conversations containing exported data.

This disconnects local connector access; it does not guarantee remote revocation of every token at Garmin or delete Claude conversation history. Users can change their Garmin password or use any Garmin-provided session controls for additional account security.

Operational logs must not include request bodies, OAuth query strings, tool arguments, Garmin responses or tokens. Database backups contain encrypted tokens and must have a documented deletion schedule set by the operator.

## Consent and sensitive data

Connection requires an affirmative AI-processing acknowledgement and an OAuth consent decision. Read-only is the default permission. Write access is separately selectable and destructive calls need explicit confirmation.

Special-category data such as health, ECG, location and women's health information should only be requested when needed for the user's question. Operators are responsible for consent records, applicable health/privacy law, data-subject requests, incident response and any Garmin approval requirements.
