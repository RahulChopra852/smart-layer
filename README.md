# GNC Smart Layer

PM-facing analytics layer for GNC India — pulls live from Shopify + your CRO/webvitals Google Sheet,
plus manual Meta CSV uploads, into one "Dashboard DB" Google Sheet, with RCA notes and action items.

Separate system from the existing `gnc_dashboard_v2.html` / `/dashboard` skill. No shared state.

## One-time setup (do this before first run)

### 1. Google service account (so the app can write to "Dashboard DB")
1. Go to console.cloud.google.com → create or pick a project → enable "Google Sheets API"
2. IAM & Admin → Service Accounts → Create → download the JSON key
3. Save it as `server/credentials/service-account.json` (this path is gitignored)
4. Open the JSON, find `client_email` — copy it
5. Share **Dashboard DB** with that email as Editor:
   https://docs.google.com/spreadsheets/d/1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE
6. Share your CRO-Auto / webvitals source workbook with that same email as Viewer

### 2. Shopify access token
Your custom app on guardian.in already has `read_reports` + `read_customers` approved (per setup).
Make sure it also has `read_orders` + `read_products`. Grab the Admin API access token.

### 3. Environment variables
Copy `.env.example` to `.env` and fill in:
```
GOOGLE_APPLICATION_CREDENTIALS=server/credentials/service-account.json
SHOPIFY_STORE_DOMAIN=guardian-in.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
CRO_SOURCE_SPREADSHEET_ID=1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4
PORT=3000
```

## Run

```
npm install
npm start
```

Open http://localhost:3000

On first start, the app auto-creates any missing tabs in Dashboard DB. If you see a credentials
error in the console, re-check step 1 above — this is almost always a sharing-permission issue.

## Triggering a sync

The app does NOT auto-poll. Sync is manual, incremental, and source-by-source:
- `POST /api/sync/all` — runs every source
- `POST /api/sync/:source` — one of: shopify_orders, shopify_sessions, cro_web, cro_app, webvitals

Each sync only pulls data after its last watermark (stored in the `_sync_state` tab) — re-running
never re-pulls history already cached. To force a full re-crawl of one source, clear its tab and
its `_sync_state` row manually in the sheet (deliberately not exposed as a one-click button, to
avoid accidental data loss).

## Uploading a Meta report

`POST /api/meta/upload` — multipart form, field name `file`, accepts the
"GNC-DAILY-FUNNEL-REPORT-DATA" CSV export format. Appends to `meta_reports`; never overwrites
or re-derives prior uploads.

## Status

Backend: done (Shopify connector, CRO/webvitals sheet reader, Meta CSV parser, RCA notes +
action-item detection, analytics aggregation routes).

Frontend: not yet built — by design, sequenced after backend so the UI is wired to real synced
data rather than mocked numbers. See SPEC.md for full feature scope.

See `SPEC.md` for the full architecture, locked decisions, and verified Shopify field names.
