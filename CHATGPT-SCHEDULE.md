# Connect ChatGPT to Smartmathz (OAuth MCP)

Live site: **https://resource-page-v2.netlify.app/**  
MCP endpoint: **https://resource-page-v2.netlify.app/mcp**

The site is public. Catalog **writes** never expose `SMARTMATHZ_UPDATE_TOKEN` to ChatGPT. ChatGPT connects with **OAuth**, then calls MCP tools; the server applies updates with the Netlify-held update token.

## 0. Prerequisite — confirm Plugins access

Before relying on the daily task:

1. Open ChatGPT on the web.
2. Go to **Plugins** → **+** → **Add custom MCP server**.
3. If that option is missing, your plan/workspace cannot install this connector yet. The MCP server can still be deployed; publishing will need Plugins access or another publisher (for example a GitHub Action that holds the update token).

## 1. Netlify environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SMARTMATHZ_UPDATE_TOKEN` | Yes | Server-only catalog writer (≥ 32 chars). Never give to ChatGPT. |
| `SMARTMATHZ_OPERATOR_PASSWORD` | Yes | Operator password on the OAuth authorize page (≥ 16 chars). |
| `SMARTMATHZ_OAUTH_JWE_SECRET` | Yes | Seals OAuth codes/tokens (≥ 32 chars). |
| `SMARTMATHZ_SITE_URL` | Recommended | `https://resource-page-v2.netlify.app` (issuer / resource origin). |
| `SMARTMATHZ_VIEWER_PASSWORD` | No | Unused (public site). |

Generate secrets locally; set them in Netlify → Environment variables (Functions scope); redeploy.

## 2. Connect in ChatGPT Plugins

1. Plugins → Add custom MCP server.
2. Name: `Smartmathz` (or similar).
3. Server URL: `https://resource-page-v2.netlify.app/mcp`
4. Authentication: **OAuth**.
5. Acknowledge the risk warning → Create as a plugin.
6. Complete the operator login with `SMARTMATHZ_OPERATOR_PASSWORD`.
7. Install the plugin. Manually test `@Smartmathz` → `get_catalog`, then a small `apply_catalog_update` if needed.

## 3. Daily 8:00 AM Africa/Lagos task

Point the scheduled task at this **plugin**, not at raw HTTP with a pasted token.

Each run should:

1. Call `get_updater_guide`
2. Call `get_catalog` (keep `revision`)
3. Review official sources (web research) per the guide
4. Call `apply_catalog_update` with `{ runId, expectedRevision, upserts, run, automation? }`
5. Call `get_catalog` or `get_feed_status` and confirm `storage` is `persisted` and `lastRun.id` matches `runId`

After a successful automated write, include:

```json
"automation": {
  "enabled": true,
  "timezone": "Africa/Lagos",
  "schedule": "08:00",
  "id": "chatgpt-daily-netlify"
}
```

Setting automation metadata alone does not create a schedule.

## 4. Smoke checks

- https://resource-page-v2.netlify.app/ opens with no login
- https://resource-page-v2.netlify.app/api/feed-status returns JSON
- Unauthenticated `POST /mcp` returns 401 with `WWW-Authenticate` resource metadata
- After OAuth connect, `get_catalog` works from ChatGPT
- `apply_catalog_update` persists without ChatGPT ever seeing `SMARTMATHZ_UPDATE_TOKEN`
