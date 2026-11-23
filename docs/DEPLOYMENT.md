# Deployment

## Topology

- **Public hostname:** `garmin.system.style`
- **MCP URL:** `https://garmin.system.style/mcp`
- **Ingress:** Cloudflare Tunnel to `http://app:3000`
- **Server listener:** `127.0.0.1:3000` only (useful for SSH health checks)
- **Database:** PostgreSQL on an internal Compose network, with no host port

Claude cannot reach a Tailscale-only URL. Tailscale is used for administration; Cloudflare Tunnel supplies the public, authenticated HTTPS endpoint without changing the server's existing port 443 services.

## First deployment

```sh
npm ci
npm run secrets                 # creates .env once, mode 0600
npm run check
docker compose build
docker compose up -d app db
docker compose ps
curl -fsS http://127.0.0.1:3000/health/ready
```

Keep `.env` backed up separately from the database. Losing `TOKEN_ENCRYPTION_KEY` makes stored Garmin tokens unusable; losing the OIDC private JWK invalidates connector access tokens. Never commit or publish either backup.

## Cloudflare Tunnel

Create a **remotely managed** tunnel in Cloudflare Zero Trust, add this public hostname, and set its service URL:

| Field | Value |
|---|---|
| Subdomain | `garmin` |
| Domain | `system.style` |
| Service | `http://app:3000` |

Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, then run:

```sh
docker compose --profile tunnel up -d tunnel
curl -fsS https://garmin.system.style/health/ready
```

Alternatively, use the `cloudflared` CLI after `cloudflared login`:

```sh
cloudflared tunnel create garmin-connect-mcp
cloudflared tunnel route dns garmin-connect-mcp garmin.system.style
cloudflared tunnel token garmin-connect-mcp
```

Put the resulting token in `.env`. Do not send it in chat or commit it.

Cloudflare settings:

- Always Use HTTPS: on
- Minimum TLS: 1.2 or newer
- Do not add access rules that block Anthropic's egress addresses
- Bot Fight Mode: off for this hostname if it challenges OAuth discovery or MCP POSTs
- Cache: bypass everything; responses are also `Cache-Control: no-store`
- WebSockets are not required

## Validate OAuth discovery

```sh
curl -i https://garmin.system.style/mcp
curl -fsS https://garmin.system.style/.well-known/oauth-protected-resource/mcp | python3 -m json.tool
curl -fsS https://garmin.system.style/.well-known/oauth-authorization-server | python3 -m json.tool
```

The unauthenticated `/mcp` response must be HTTP 401 with a `WWW-Authenticate` header containing `resource_metadata`. The metadata `resource` must be exactly `https://garmin.system.style/mcp`.

## Updates

```sh
npm run check
docker compose build app
docker compose up -d app
docker compose --profile tunnel up -d
```

Migrations run automatically under a PostgreSQL advisory lock. Preserve the same `.env` and `postgres-data` volume.

## Backup and deletion

```sh
docker compose exec -T db pg_dump -U garmin -d garmin_mcp --format=custom > garmin-mcp.dump
```

The dump contains encrypted OAuth tokens and OIDC state. Treat it as sensitive. To erase all user tokens and sessions:

```sh
docker compose down
docker volume rm garmin-connect-mcp_postgres-data
```

This is destructive and irreversible; take a backup first if any data must be retained.

## Local development

Use `BASE_URL=http://localhost:3000`, run PostgreSQL separately, install the auth worker dependencies, and start with `npm run dev`:

```sh
python3 -m venv auth-worker/.venv
auth-worker/.venv/bin/pip install -r auth-worker/requirements.txt
npm run dev
```

Production requires HTTPS. Claude's hosted apps use `https://claude.ai/api/mcp/auth_callback`; Claude Code uses a loopback callback.
