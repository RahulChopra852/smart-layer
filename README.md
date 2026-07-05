# GNC Smart Layer

PM-facing analytics layer for GNC India — pulls live from Shopify + your CRO/webvitals Google Sheet,
plus manual Meta CSV uploads, into a **Supabase Postgres** datastore, with RCA notes and action items.

Separate system from the existing `gnc_dashboard_v2.html` / `/dashboard` skill. No shared state.

## Datastore: Supabase (not Google Sheets)

The app's own data (Shopify, CRO, web vitals, Meta, RCA notes, alerts, VWO, OOS log) is written
directly to Supabase Postgres — see `server/db/supabaseDb.js`. Every synced table has a natural-key
`UNIQUE`/primary-key constraint, so re-syncing the same date/campaign/etc. **overwrites in place**
instead of duplicating rows (`INSERT ... ON CONFLICT DO UPDATE`). Event logs (RCA notes, alerts) are
append-only with an auto-generated id.

GoKwik, Google Ads, and PSI web-vitals data are still produced by separate Google Apps Script
projects (`scripts/*-appscript.js`) that parse Gmail reports straight into the old "Dashboard DB"
Google Sheet — that pipeline is left as-is. This app mirrors those specific tabs into Supabase
(`server/services/sheetMirror.js`, run via the `sheet_mirror` sync source) so they're queryable
alongside everything else.

Row Level Security is enabled on every table with no public policies — only the **service role**
key (server-side, `.env`, never shipped to the browser) can read/write. The frontend never talks to
Supabase directly, only to this Express API.

## One-time setup (do this before first run)

### 1. Supabase connection (primary datastore)
1. Project: "gnc smart layer" at supabase.com/dashboard (ref `ycrdocpkkzhwxpmdpsfn`)
2. Project Settings → API Keys → copy the **service_role** secret key (not the anon/publishable one)
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` (see below)

### 2. Google service account (still needed — read-only access to source sheets)
1. Go to console.cloud.google.com → create or pick a project → enable "Google Sheets API"
2. IAM & Admin → Service Accounts → Create → download the JSON key
3. Save it as `server/credentials/service-account.json` (this path is gitignored)
4. Open the JSON, find `client_email` — copy it
5. Share your CRO-Auto / webvitals source workbook, and the "Dashboard DB" sheet (for the GoKwik/
   Ads/PSI mirror), with that email as Viewer

### 3. Shopify access token
Your custom app on guardian.in already has `read_reports` + `read_customers` approved (per setup).
Make sure it also has `read_orders` + `read_products`. Grab the Admin API access token.

### 4. Environment variables
Copy `.env.example` to `.env` and fill in:
```
SUPABASE_URL=https://ycrdocpkkzhwxpmdpsfn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_APPLICATION_CREDENTIALS=server/credentials/service-account.json
SHOPIFY_STORE_DOMAIN=guardian-in.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
CRO_SOURCE_SPREADSHEET_ID=1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4
PORT=3000
```

## Run

Backend:
```
npm install
npm start        # or: npm run dev  (auto-restart on change)
```
Serves the API on http://localhost:3000

Frontend:
```
cd client
npm install
npm run dev
```
Serves the dashboard UI on http://localhost:5173 (proxies API calls to the backend)

Tables already exist in Supabase (created via migration, not at runtime). If you see a Supabase
auth error in the console, re-check step 1 above — almost always a wrong/missing service role key.

## Triggering a sync

The app does NOT auto-poll. Sync is manual, incremental, and source-by-source:
- `POST /api/sync/all` — runs every source, including the GoKwik/Ads/PSI sheet mirror
- `POST /api/sync/:source` — one of: shopify_orders, shopify_sessions, cro_web, cro_app, webvitals, ga_app, sheet_mirror

Most sources only pull data after their last watermark (stored in `_sync_state`) — re-running never
re-pulls cached history. `sheet_mirror` is a cheap full-table re-upsert each time (low volume, no
watermark needed). To force a full re-crawl of a watermarked source, clear its Supabase table and
`_sync_state` row (deliberately not exposed as a one-click button, to avoid accidental data loss).

## Uploading a Meta report

`POST /api/meta/upload` — multipart form, field name `file`, accepts the
"GNC-DAILY-FUNNEL-REPORT-DATA" CSV export format. Upserts into `meta_reports`, keyed by
campaign + ad + reporting date range — re-uploading the same report overwrites instead of duplicating.

## Status

Backend: done (Shopify connector, CRO/webvitals sheet reader, Meta CSV parser, RCA notes +
action-item detection, analytics aggregation routes, GoKwik/Google Ads/VWO integrations, AI chat
widget backend).

Frontend: built — Vite + React dashboard with Summary, CRO Funnel, Page Performance, Products,
GA App/Web, GoKwik, Google Ads, VWO, Meta, Web Vitals, RCA Notes, Anomalies tabs, plus a day-trend
view, RCA snapshot, sync status indicator, and an AI chat widget. See SPEC.md for full feature scope.

See `SPEC.md` for the full architecture, locked decisions, and verified Shopify field names.
