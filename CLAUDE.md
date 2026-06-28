# GNC India Smart Layer Dashboard

## Stack
- **Backend**: Node.js + Express (port 3000)
- **Frontend**: Vite + React (port 5173) with Tailwind CSS
- **Data**: Google Sheets as DB, Shopify Admin API, Google Analytics, Meta CSV uploads
- **Auth**: Google service account at `server/credentials/service-account.json`

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
- **CRO source sheet**: `1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4` (tabs: CRO-Auto, Funnel(App))
- **Dashboard DB sheet**: `1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE`
- **GA App Property**: `422590924`
- **GA Web Property**: `308908921`

## Sync
- Incremental sync with watermarks stored in `_sync_state` sheet tab
- CRO date-specific re-sync: `POST /api/sync/cro-date` with `{ dates: [...], channels: ["web","app"] }`
- GA App data persisted in `ga_app_daily` tab for long-term retention
- Sessions capped at 200 rows, start date `2026-06-21`

## ShopifyQL Gotcha
`shopifyQL()` returns `result.tableData.rows` which are already objects (not arrays). Do NOT re-map through `Object.fromEntries`.

## Windows Notes
- Use `cmd /c` wrapper for npm commands (PowerShell execution policy)
- Kill port with `Get-NetTCPConnection -LocalPort <port> | Stop-Process`
