# Smartmathz Resources — Netlify source

A student opportunity hub focused on New York and Maryland, with scholarships, college applications, internships, jobs and student events. Includes the animated homepage, saved resources, source/deadline details, and an 18-profile Career Explorer.

This is a Netlify adaptation of the current private Smartmathz rebuild. The UI uses HTML, CSS and JavaScript; it is not the older Next.js repository. The Cloudflare Worker/R2 backend has been adapted to Netlify Functions/Blobs. The current catalog was exported from the live site; provenance is in [data/export-info.json](data/export-info.json). No live credentials are included.

## Deploy to Netlify

Use Node.js 24 and npm. Deploy the **whole source project**, including its Netlify Function. Dragging only a static output folder into Netlify will omit the application gateway and update backend.

1. Extract this folder and open it in VS Code.
2. Run `npm ci`, `npm test`, then `npm run build`.
3. Put the project in a Git repository you control, keeping `.env`, `node_modules`, `.netlify` and `dist` untracked. Import that repository into Netlify.
4. Netlify reads [netlify.toml](netlify.toml). The build command is `npm run build`, the publish directory is `dist`, and the functions directory is `netlify/functions`. Leave the base directory blank if these files are at the repository root.
5. Before deployment, set the two private variables below in Netlify **Project configuration → Environment variables**. If scope selection is available, include **Functions**. Set production values deliberately; leave previews unconfigured or give them separate test values. Redeploy after changing values.
6. Deploy from Netlify. Open `/` or `/resources/` and sign in with username **smartmathz** and your viewer password. `/careers/` opens Career Explorer.

| Variable | Purpose | Required value |
| --- | --- | --- |
| `SMARTMATHZ_VIEWER_PASSWORD` | Shared private preview access | A unique random password, at least 16 characters |
| `SMARTMATHZ_UPDATE_TOKEN` | Administrative bearer token for catalog updates | A different random secret, at least 32 characters |

Generate each secret separately on your own computer with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store the results in your password manager and Netlify, never in a committed file or browser JavaScript.

The site stays closed when the viewer password is missing or too short. The updater is disabled when its token is missing or too short. The shared password gate preserves private preview access; it does not provide individual student accounts, roles, or the original ChatGPT account allowlist.

## Run locally

Copy [.env.example](.env.example) to `.env`, fill in the two secrets with local test values, then run:

```sh
npm ci
npm run dev
```

Open the URL printed by Netlify Dev and use the preview credentials above. `npm run dev` builds before starting. Restart it after changing source files. Netlify Dev supplies local service emulation; a successful local test does not prove your hosted Netlify environment has been configured.

## How daily updates work

The existing daily task lives in ChatGPT and is enabled for **8:00 AM Africa/Lagos**. It reviews official university, government, employer and programme organiser pages; verifies the current cycle, student eligibility and deadline; merges changes by stable ID; and reads back the saved catalog. It can run while nobody has the site open. It updates the existing private ChatGPT Site, **not this Netlify copy**.

This repository supplies a writer and research instructions, not an autonomous scholarship scraper or an installed Netlify schedule. The catalog marks automatic checks as disconnected until a real scheduler is connected to this deployment. A daily check may find no new opportunities. If a source fails, retain its last successfully verified facts and show the failure honestly.

To migrate the task after deployment:

1. Verify the Netlify URL, private access gate, `/api/catalog` read, authenticated write and persistent readback.
2. Give the updater the Netlify origin and token through an approved secret mechanism. Never reuse the private ChatGPT Sites service token.
3. Explicitly change the existing task's destination or configure an external agent/scheduler to follow `/api/updater-guide`. Avoid running two writers for the same catalog. This export does not change or pause your existing task.
4. Enable the catalog's `automation` metadata only after that schedule is configured and verified. Setting the metadata alone does not create a schedule.

Detailed source rules and the record schema live in [data/updater-guide.json](data/updater-guide.json). The initial official provider list is [data/sources.json](data/sources.json).

## Apply a reviewed update

Use the same protocol from a trusted researcher, backend worker or scheduled agent. The API does not fetch or validate source pages for you: the researcher must actually review the official source before marking a record verified.

1. Set `SMARTMATHZ_SITE_URL` to your verified HTTPS Netlify origin and `SMARTMATHZ_UPDATE_TOKEN` in the updater's environment or local ignored `.env`.
2. Start with [examples/update-template.json](examples/update-template.json). Give the batch a stable run ID, replace the template notes, report the actual source-check result, and put complete reviewed records in `upserts`. Copy a live record's structure from `/api/catalog` and consult the guide. Update `lastVerifiedAt` only after checking its source.
3. Run:

```sh
npm run update:catalog -- path/to/reviewed-batch.json
```

The script reads the current revision, posts the batch, reads back persistent data, and compares saved records. Repeat the **same run ID and batch** after an ambiguous timeout. A revision conflict requires a fresh read and merge. Updated records must have source reviews within the last 72 hours; unknown dates must remain null. Use at most 100 upserts per batch.

| Endpoint | Behavior |
| --- | --- |
| `GET /catalog.json` | Records used by the browser |
| `GET /api/catalog` | Full catalog, revision and persistence status |
| `GET /api/feed-status` | Review status and scheduler metadata |
| `GET /api/updater-guide` | Source checklist and update protocol |
| `POST /api/catalog/update` | Token-protected, validated merge with readback support |

API clients send `Authorization: Bearer <SMARTMATHZ_UPDATE_TOKEN>`. The token is accepted only on catalog API paths, not as general access to static pages. A viewer password cannot authorize updates. A POST body is `{runId, expectedRevision, upserts, run:{status,sourcesChecked,notes}}`, with optional `automation` metadata. No secret is returned in the API responses.

## Data storage and deployment contexts

The catalog uses Netlify Blobs with strongly consistent reads, conditional writes, revision checks and history snapshots. All pages and assets are served through a password-protected Netlify Function. The publish directory contains only a closed fallback page so static-only deployment does not expose the application. The bundled seed is used until the first persisted write; future deployments preserve the live stored catalog instead of overwriting it with the seed.

The build chooses the store in `data/runtime-config.json`. Production uses `smartmathz-opportunities`; previews and local builds use a separate namespace. Run the normal Netlify build in the intended context. Do not hand-edit runtime configuration to point a preview at production.

After a hosted write, `/api/catalog` should show `storage: "persisted"` and the updated revision. A static file edit does not replace a persisted catalog. Use the writer for live content changes, and Git deployment for design/code changes.

## Source map

| Path | Purpose |
| --- | --- |
| `public/` | Editable homepage, resources, careers, CSS, JS and image/font assets |
| `server/catalog-core.mjs` | Catalog validation, revision merge and history behavior |
| `server/netlify-store.mjs` | Netlify Blobs storage adapter |
| `server/access.mjs` | Shared viewer/updater authorization |
| `netlify/functions/site.mjs` | Hosted page gateway and catalog API |
| `server/site-handler.mjs` | Password-protected page and asset gateway |
| `scripts/update-catalog.mjs` | Reviewed-batch client with readback verification |
| `data/` | Catalog snapshot, official sources and updater instructions |
| `tests/catalog.test.mjs` | Access, validation, persistence, retry and race checks |

## Validation and limits

Run `npm test` for access, writer and storage-adapter tests. `npm run build` creates the static assets and context configuration. `npx netlify build --offline` also exercises Netlify's function packaging without deploying.

Storage tests use an in-memory double of the Netlify SDK; they do not create cloud records. See [VALIDATION.md](VALIDATION.md) for the checks actually completed for this export. No Netlify deployment has been made. The original private Site and existing daily task are unchanged.

Opportunity deadlines use America/New_York for date-only expiry. An exact provider cutoff is used only when published. Closed records are hidden by default; application dates, nominations, registration windows and event dates remain distinct. Saved resources and careers are stored in the visitor's browser, not synced between devices.

## License and assets

No project licence has been assigned in this export. Smartmathz branding and supplied assets remain associated with their owners. Review their usage rights before redistributing this project outside the intended Smartmathz use.

## Netlify references

- [Functions configuration](https://docs.netlify.com/build/functions/configuration/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Function environment variables](https://docs.netlify.com/build/functions/environment-variables/)
