# Export validation

Validated on 29 October 2026 using Node.js 24.22.1 and Netlify CLI 27.15.0.

- Exported the persisted live catalog: 16 records, 14 focused on New York or Maryland, data revision 2.
- Matched the source UI to published version 4, commit `769e6f23cf94cbeeee7ae681cdf0fb228a31e87c`.
- Installed dependencies successfully and included a package lock for `npm ci`.
- Passed all 9 tests covering private access, updater authorization, source/date validation, persistence through the storage adapter, repeat-safe commits, concurrent revision conflicts, history snapshots, binary/page serving and the update client's HTTP write/readback.
- Completed `netlify build --offline` successfully, including the complete site Function bundle and `/*` routing manifest.
- Confirmed the publish folder contains only closed fallback pages. The editable application assets are bundled into the authenticated Function.
- Checked README file links and excluded runtime caches, dependencies, credentials and generated build artifacts from the download.

The storage-adapter tests use an in-memory implementation; the client test uses a local HTTP fixture. This export has not been deployed to Netlify, and hosted Netlify Blobs access has not been exercised. Verify private access and an authenticated catalog write/readback after you deploy.

The existing private Smartmathz deployment and its daily task were not changed during this export. The Netlify copy starts with automatic updates marked disconnected until you deliberately configure its updater.
