# Connect the daily ChatGPT task to Netlify

Live site: **https://resource-page-v2.netlify.app/**

The site is public. Only catalog **writes** need `SMARTMATHZ_UPDATE_TOKEN`. Netlify does not scrape sources on its own — your ChatGPT scheduled task (or another agent) must call this deployment each day.

## 1. Secrets (never commit these)

In Netlify → Site configuration → Environment variables (Functions scope):

| Variable | Required |
| --- | --- |
| `SMARTMATHZ_UPDATE_TOKEN` | Yes — random secret ≥ 32 characters |
| `SMARTMATHZ_VIEWER_PASSWORD` | No longer required (public site) |

In the ChatGPT task / agent secret store, set:

- `SMARTMATHZ_SITE_URL` = `https://resource-page-v2.netlify.app`
- `SMARTMATHZ_UPDATE_TOKEN` = the **same** value as Netlify

Do not reuse an old ChatGPT Sites service token.

## 2. Retarget the existing 8:00 AM Africa/Lagos task

Change the task destination from the private ChatGPT Site to this Netlify origin. Avoid running two writers against two live catalogs.

Each run should:

1. `GET https://resource-page-v2.netlify.app/api/updater-guide` with `Authorization: Bearer <SMARTMATHZ_UPDATE_TOKEN>`
2. `GET https://resource-page-v2.netlify.app/api/catalog` (public; bearer also fine)
3. Review official sources per the guide (`data/sources.json` + each record’s `sourceUrl`)
4. Build a batch (`runId`, `expectedRevision`, `upserts`, `run`) — see `examples/update-template.json`
5. `POST https://resource-page-v2.netlify.app/api/catalog/update` with JSON body and the bearer token
6. `GET /api/catalog` again and confirm `storage` is `persisted`, revision advanced, and `lastRun.id` matches `runId`

Optional local dry-run after a reviewed batch file:

```sh
SMARTMATHZ_SITE_URL=https://resource-page-v2.netlify.app SMARTMATHZ_UPDATE_TOKEN=... npm run update:catalog -- path/to/reviewed-batch.json
```

## 3. Mark automation connected

Only after a successful scheduled write, include in a verified update batch:

```json
"automation": {
  "enabled": true,
  "timezone": "Africa/Lagos",
  "schedule": "08:00",
  "id": "chatgpt-daily-netlify"
}
```

Setting this metadata alone does not create a schedule.

## 4. Smoke checks

- Open https://resource-page-v2.netlify.app/ — no username/password
- https://resource-page-v2.netlify.app/resources/ and `/careers/` load
- https://resource-page-v2.netlify.app/api/feed-status returns JSON
- A token-authenticated POST update succeeds and readback shows `persisted`
