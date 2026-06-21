# GNC Smart Layer — v1 Spec

Separate system from `gnc_dashboard_v2.html` / `/dashboard` skill. No shared state.

## Locked decisions
- Backend: Node.js + Express
- DB: **Google Sheets** — "Dashboard DB" spreadsheet, ID `1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE`. Separate from CRO-Auto/master backlog sheet. Tabs created/managed by the app on first run: `shopify_daily`, `shopify_products`, `page_sessions`, `cro_daily`, `webvitals`, `meta_reports`, `rca_notes`, `_sync_state`. Incremental sync only — track last-synced date per source in `_sync_state` tab, never re-pull cached date ranges. Batched writes (not row-by-row) to respect Sheets API rate limits.
- Frontend: single-page app served by Express, animated lava-bar aesthetic, white background
- Brand scope: GNC India only (guardian.in)
- Meta data: manual CSV upload per report, NOT live API. Schema is campaign-level snapshot (not daily), confirmed columns: Campaign name, Reach, Amount spent (INR), CTR, CPM, CPC, Cost per LPV, Cost per purchase, AOV, LC→LPV / LPV→A2C / A2C→CI / A2C→Ordered / CI→ORDER (Meta's OWN funnel terms — kept separate from Shopify CRO funnel terms ATC/IC/RPP, never conflated), sessions, LPV, link clicks, Reporting starts/ends. First data row (blank campaign name) = account-level total row, parsed separately from per-campaign rows.
- RCA: hybrid — infer candidates from existing sheet "Comments" columns (see CRO-Auto col AC, Funnel App) keyed by date, PLUS a manual notes table the user can write to directly in-app. Both surfaced together, never auto-merged into a single inferred narrative.

## Data sources

| Source | Pull method | Grain | Written to "Dashboard DB" tab |
|---|---|---|---|
| Shopify orders/products | Admin GraphQL | per-order, rolled to daily | `shopify_daily`, `shopify_products` |
| Shopify sessions by landing page + source | `shopifyqlQuery` (`FROM sessions`) | daily | `page_sessions` |
| CRO-Auto sheet (web+app funnel, GoKwik checkout cols) | Sheets API (read from source sheet) | daily row | `cro_daily` (synced copy) |
| Real time webvitals sheet | Sheets API (read from source sheet) | per-pageview-test-run | `webvitals` (synced copy) |
| Meta report | manual CSV upload | per-campaign snapshot, date-ranged | `meta_reports` |
| RCA notes | manual entry / sheet comment columns | dated | `rca_notes` |

## Sync contract
`_sync_state` tab in Dashboard DB: one row per source — `source | last_synced_date | last_synced_at`.
On each "Refresh" trigger (manual button, not auto-polling):
1. Read `last_synced_date` for that source from `_sync_state`
2. Fetch only rows/dates after that watermark from the origin (Shopify API or source Sheet)
3. Batch-append new rows to the relevant Dashboard DB tab, update `_sync_state`
Full re-crawl only happens if user explicitly clears a source's tab via an in-app "reset source" action.

## v1 feature set
1. Commerce snapshot — units sold, orders, top 5 hero products, DoD/WoW deltas
2. Page performance — sessions + ATC% by landing page, broken down by source (organic/paid social/paid search/direct/email/etc.)
3. CRO funnel deltas — ATC%/IC%/RPP% web vs app, plain-language day-over-day movement
4. Web vitals — threshold breach flags (LCP/INP/CLS), regression highlighting
5. Meta report viewer — per-campaign table + account totals, NOT auto-correlated to Shopify dates unless user explicitly asks (different grain: Meta is a date-range snapshot, Shopify/CRO is daily)
6. RCA panel — sheet-comment-derived notes + user-added manual notes, both dated and tagged to affected metric
7. Action items — generated list of unexplained anomalies (movement with no RCA note attached)

## Explicitly out of v1
- No Meta Marketing API
- No multi-brand
- No forecasting/predictive modeling
- No push alerting (pull-based, open app to see)

## One-time setup required before first run (you, not me — needs Google Cloud Console access)
1. Go to Google Cloud Console → create/select a project → enable "Google Sheets API"
2. Create a Service Account → generate a JSON key → download it, save as `server/credentials/service-account.json` (gitignored)
3. Open the service account JSON, copy the `client_email` value
4. Share the "Dashboard DB" sheet (https://docs.google.com/spreadsheets/d/1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE) with that email as **Editor**
5. Also share the source sheets (CRO-Auto / webvitals workbook, master backlog) with the same email as **Viewer** (read-only needed)
6. Set `GOOGLE_APPLICATION_CREDENTIALS=server/credentials/service-account.json` in `.env`
This is the only manual setup step — everything else is `npm install && npm start`.

## Shopify auth
Needs a Shopify Admin API access token with `read_reports`, `read_customers`, `read_products`, `read_orders` scopes (custom app on the guardian.in store, same as already approved). Set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ACCESS_TOKEN` in `.env`.
- `landing_page_path` (STRING) — confirmed working dimension
- `referrer_source` (STRING) — broad buckets: direct, search, social, unknown, paid, email
- `referrer_name` (STRING) — granular: instagram, facebook, google, youtube, bing, etc. (referrer-based, NOT campaign-based)
- `utm_source` (STRING) — campaign-tagged, granular and well-populated on this store: Google, meta, ig, facebook, fb, crm, Whatsapp, etc. PRIMARY field for source breakdown — better signal than referrer_name since it reflects actual campaign tagging, not just domain referral.
- `utm_medium`, `utm_campaign` — available for further drill-down if needed later, not in v1 scope
- `sessions` (INTEGER) — base metric
- `sessions_with_cart_additions` (INTEGER) — the ATC-equivalent metric; ATC% = sessions_with_cart_additions / sessions
- Known limitation: large null utm_source volume (untagged direct/organic traffic) — falls back to referrer_source bucketing in the connector.
