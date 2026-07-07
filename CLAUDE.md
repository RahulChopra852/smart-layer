# GNC India Smart Layer Dashboard

## Stack
- **Backend**: Node.js + Express (port 3000)
- **Frontend**: Vite + React (port 5173) with Tailwind CSS
- **Data**: Supabase Postgres as the DB (`server/db/supabaseDb.js`), Shopify Admin API, Google
  Analytics, CRO/webvitals Google Sheet (read-only source), Meta CSV uploads
- **Auth**: Supabase service role key (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in `.env`) for
  the DB; Google service account at `server/credentials/service-account.json` for reading source sheets
- **RLS**: enabled on all tables, no public policies — only the service role key (server-side only)
  can read/write. Frontend never talks to Supabase directly.

## Dev Servers
```
# Backend: npm run dev (from project root)
# Frontend: npm run dev (from client/)
```

### Start Engines
When the user says **"start engines"**, **"start the engines"**, **"switch on engines"**, or **"turn on ignition"**:
1. Play the sports car engine start sound (macOS: `afplay` or `osascript` beep sequence)
2. Start both backend (port 3000) and frontend (port 5173)
3. Confirm with engine-running message

When the user says **"kill engines"**, **"turn off engines"**, or **"shut down"**:
1. Stop both servers
2. Play engine shutdown sound

## Key Data Sources
- **Supabase project**: "gnc smart layer", ref `ycrdocpkkzhwxpmdpsfn`, region ap-south-1 — owns
  shopify_daily/products, page_sessions, cro_daily, webvitals, meta_reports, rca_notes, alerts,
  vwo_campaigns, oos_log, ga_app_daily, _sync_state
- **CRO source sheet** (read-only, Sheets API): `1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4` (tabs: CRO-Auto, Funnel(App))
- **Dashboard DB sheet** (legacy — GoKwik/Google Ads/PSI Apps Script still writes here, mirrored into
  Supabase, not otherwise used): `1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE`
- **GA App Property**: `422590924`
- **GA Web Property**: `308908921`

## Sync
- Incremental sync with watermarks stored in Supabase `_sync_state` table
- Every synced table has a natural-key upsert constraint — re-sync overwrites in place, never duplicates
- CRO date-specific re-sync: `POST /api/sync/cro-date` with `{ dates: [...], channels: ["web","app"] }`
- GA App data persisted in `ga_app_daily` table for long-term retention
- Sessions capped at 200 rows, start date `2026-06-21`
- `sheet_mirror` source: copies GoKwik/Google Ads/PSI tabs from the Dashboard DB sheet (still
  populated by `scripts/*-appscript.js` Apps Script projects, unchanged) into Supabase

## ShopifyQL Gotcha
`shopifyQL()` returns `result.tableData.rows` which are already objects (not arrays). Do NOT re-map through `Object.fromEntries`.

## Windows Notes
- Use `cmd /c` wrapper for npm commands (PowerShell execution policy)
- Kill port with `Get-NetTCPConnection -LocalPort <port> | Stop-Process`
