# Smart Layer — Architecture & Build Specification

**Status**: Approved for build. This document is the single source of truth for the dev agent executing the build.
**Read this entire document before writing any code.**

---

## 1. What this is

Smart Layer is a **multi-brand, config-driven e-commerce analytics dashboard**. It is a from-scratch
generalization of the GNC Smart Layer (`gnc-smart-layer` repo, which this repo was forked from and
shares git history with — see §12). The defining principle:

> **Everything that is hardcoded in the GNC layer becomes a form in Smart Layer.**
> Onboarding a new brand requires zero code changes.

A brand ("workspace") connects its own data sources through setup forms. Each dashboard tab declares
what data it needs (a **report definition**, in code) and each workspace binds it to a real source
(a **report config**, created via the form). A tab renders its dashboard only when its config is
complete and validated; otherwise it shows the setup form with a live field-by-field checklist.

### Data sources — final list (v1)

| Source | Auth | Feeds |
|---|---|---|
| **Shopify** | Smart Layer Shopify app (token-vending connector) — the onboarding anchor | Orders, revenue, units, product catalog, inventory/OOS |
| **Google Analytics 4** | Per-workspace Google OAuth, GA4 Data API | CRO funnel, page sessions, session anomalies (computed by us), GA App tab |
| **Meta Ads** | CSV upload (v1); Marketing API later | Meta tab incl. Budget Leak Detector |
| **VWO** | API token | AB test results |
| **PageSpeed Insights** | API key + URL list | Web Vitals |

**There are no Google Sheets anywhere in this product.** No service accounts, no Apps Script, no
sheet mirrors, no email parsing. Anything the GNC layer read from a sheet is either computed
in-house (anomalies, CRO funnel) or comes from an API (everything else). GoKwik and Google Ads are
explicitly out of v1 (return later as proper API connections if needed).

---

## 2. Two-repo strategy (IMPORTANT — read before touching git)

Two repos, shared git history, permanently linked:

| Repo | Role | Deployment |
|---|---|---|
| `gnc-smart-layer` (GitHub: `RahulChopra1024-PM/GNC-Dashboard`) | **Sandbox / lab.** Live single-brand GNC dashboard. Fast experiments against real data. Must keep running throughout the build. | current GNC deployment |
| `smart-layer` (this repo) | **Product.** Clean, multi-tenant, config-driven. Serves ALL brands. | new deployment |

This repo was created with `git clone gnc-smart-layer smart-layer` — **full shared history** — so
`git cherry-pick` and `git merge` work across the two with sane rename/conflict behavior. Each repo
has the other as a remote (`gnc` here; `smart` in the GNC repo).

**Change flow is ONE-WAY: sandbox → product** (full commands in `SYNC.md` at repo root):
- All feature/UI/shared-logic work is built and validated in the sandbox first, then **promoted**
  here: `git fetch gnc && git cherry-pick <sha>`.
- **Never push feature work directly to this repo** — a bad change here impacts every brand at
  once. Bugs found in the product's shared UI are reproduced and fixed in the sandbox, then
  promoted.
- Only product-only infrastructure (workspaces/auth, connectors, setup-form framework, migrations,
  sync engine) is written here directly — via feature branches, verified before merging to `main`,
  because `main` is what all brands run.

**Conventions that keep cherry-picks clean — these are rules, not suggestions:**
1. Keep `client/src/components/` file names and paths **identical across both repos** wherever a
   component exists in both (e.g. `DateRangePicker.jsx`, `MetaTab.jsx`, `SessionAnomalies.jsx`).
2. One component/concern per commit. Never mix a shared-component change with server/data-layer
   changes in the same commit — server layers differ between repos and those commits never sync.
3. UI components must not import server-specific assumptions; all data arrives via props/hooks from
   `/api/...` endpoints that both repos implement with the same response shapes.

What syncs well: client components, client-side analytics/detector logic (e.g. Budget Leak
Detector), parsers (`metaParser`), styling. What never syncs: `server/db/*`, sync engine, auth,
anything workspace-related (GNC has no workspaces).

---

## 3. Stack

Identical to GNC (proven, maximizes component reuse):
- **Backend**: Node.js + Express (port 3000), ESM.
- **Frontend**: Vite + React + Tailwind CSS (port 5173). **No external UI/chart/date libraries** —
  all visual components are hand-rolled (SVG charts, custom date pickers). Keep it that way.
- **DB**: Supabase Postgres (new project, separate from GNC's). RLS on all tables, no public
  policies. Server-only service-role key. Frontend never talks to Supabase directly for data.
- **Auth**: Supabase Auth (email magic-link to start). Express verifies the Supabase JWT on every
  `/api` request and resolves workspace membership.
- **Scheduler**: in-process `node-cron` (v1), architected behind a `jobs` module so it can move to
  a real queue later without touching connectors.

---

## 4. Target repo layout

```
smart-layer/
├── docs/ARCHITECTURE.md        # this file
├── SYNC.md                     # two-repo sync workflow
├── server/
│   ├── index.js                # Express bootstrap, JWT middleware, route mounting
│   ├── db/
│   │   ├── supabaseDb.js       # client, TAB_SCHEMAS, UPSERT_KEYS (all keys now include workspace_id)
│   │   └── migrations/         # SQL files, applied via Supabase MCP/CLI, numbered 001_...
│   ├── auth/
│   │   ├── jwt.js              # verify Supabase JWT → req.user
│   │   └── workspace.js        # resolve + authorize req.workspace from header `x-workspace-id`
│   ├── crypto/secrets.js       # AES-256-GCM encrypt/decrypt for connection secrets (ENCRYPTION_KEY env)
│   ├── connectors/             # one module per source type — the ONLY code that talks to external APIs
│   │   ├── shopify.js          # token vending via connector app + Admin GraphQL queries
│   │   ├── ga4.js              # OAuth flow, property listing, runReport wrapper, probe
│   │   ├── metaCsv.js          # CSV parse (ported metaParser.js) + column probe
│   │   ├── vwo.js              # VWO REST + probe
│   │   └── psi.js              # PSI API + probe
│   ├── reports/
│   │   ├── registry.js         # REPORT_DEFINITIONS (see §7) — the heart of the product
│   │   └── compute/            # server-side computations
│   │       ├── croFunnel.js    # GA4 events → funnel rows
│   │       ├── anomalies.js    # anomaly detection (see §9.3)
│   │       └── oos.js          # OOS detection from inventory polling (see §9.2)
│   ├── sync/
│   │   ├── engine.js           # runs a report config sync: connector fetch → compute → upsert → watermark
│   │   └── scheduler.js        # node-cron; enumerates live report_configs by cadence
│   └── routes/
│       ├── workspaces.js  connections.js  reports.js  data.js  uploads.js  hooks.js
├── client/
│   └── src/
│       ├── App.jsx             # auth gate → workspace switcher → tab shell
│       ├── tabs.js             # derived from report registry via /api/reports
│       ├── hooks/useApi.js     # ported; adds Authorization + x-workspace-id headers
│       ├── setup/              # NEW — the form framework
│       │   ├── SetupForm.jsx   # renders a report definition's form (steps: source → fields → settings)
│       │   ├── FieldChecklist.jsx  # live ✓/✗ per required field from /probe
│       │   └── ConnectionsHub.jsx  # workspace-level connection management
│       └── components/         # ported from GNC, names kept identical (see §10 port map)
└── .env.example
```

---

## 5. Data model

New Supabase project. All migrations in `server/db/migrations/`, numbered and idempotent.

### 5.1 Control tables

```sql
workspaces        (id uuid pk default gen_random_uuid(), name text, slug text unique,
                   shop_domain text unique,   -- set by connector install; nullable until then
                   created_at timestamptz default now())

workspace_members (workspace_id uuid references workspaces, user_id uuid references auth.users,
                   role text check (role in ('admin','viewer')), primary key (workspace_id, user_id))

connections       (id uuid pk, workspace_id uuid not null, type text not null
                     check (type in ('shopify','ga4','meta-csv','vwo','psi')),
                   label text, secret_ciphertext text,  -- AES-256-GCM(JSON), see server/crypto
                   meta jsonb default '{}',             -- non-secret: shop domain, GA property list cache, etc.
                   status text default 'active', created_at timestamptz default now())

report_configs    (id uuid pk, workspace_id uuid not null, report_id text not null,
                   connection_id uuid references connections,
                   config jsonb not null default '{}',  -- property id, settings, field mapping, cadence
                   status text default 'draft' check (status in ('draft','validated','live','error')),
                   last_error text, last_synced_at timestamptz,
                   unique (workspace_id, report_id))
```

### 5.2 Data tables

Take the GNC `TAB_SCHEMAS` shapes and **prepend `workspace_id uuid not null` to every table and to
every natural key**. v1 tables (drop everything sheet-fed that has no API replacement):

| Table | Natural key (upsert `ON CONFLICT`) | Source |
|---|---|---|
| `shopify_daily` | (workspace_id, date) | Shopify |
| `shopify_products` | (workspace_id, date, product_id) | Shopify |
| `oos_log` | (workspace_id, product_id) | computed (§9.2) |
| `cro_daily` | (workspace_id, date, channel) | computed from GA4 (§9.1) |
| `page_sessions` | (workspace_id, date, landing_page, source_field, source_value) | GA4 |
| `anomalies` **(new)** | (workspace_id, date, page, type) | computed (§9.3) |
| `ga_app_daily` | (workspace_id, date, platform) | GA4 (app property) |
| `meta_reports` | (workspace_id, campaign_name, ad_name, reporting_start, reporting_end) | CSV upload |
| `vwo_campaigns` | (workspace_id, id) | VWO |
| `psi_daily` | (workspace_id, date, page) | PSI |
| `ab_tests` | append-only, serial id + workspace_id | user-entered |
| `rca_notes` | append-only, serial id + workspace_id | user-entered |
| `_sync_state` | (workspace_id, source) | engine |

Column lists for ported tables: copy from GNC `server/db/supabaseDb.js` `TAB_SCHEMAS` verbatim
(minus sheet-only tables: `webvitals`, `gokwik_*`, `google_ads_*`, `discount_failures`,
`abandoned_carts`). `anomalies` columns: `date, page, type, session_delta, atc_delta,
yesterday_sessions, last_7d_sessions, prev_7d_sessions, trend numeric, impact numeric`.

### 5.3 RLS

Every table: RLS enabled. One policy pattern:

```sql
create policy ws_member on <table> for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
```

No insert/update/delete policies for authenticated users — **all writes go through Express with the
service-role key** (which bypasses RLS; Express enforces workspace scoping itself via
`req.workspace`). This mirrors GNC's posture and keeps the client read path available later if we
ever want direct reads.

### 5.4 Secrets

`connections.secret_ciphertext` = AES-256-GCM of a JSON blob (`{refresh_token}` for GA,
`{api_token}` for VWO, `{api_key}` for PSI). Key from `ENCRYPTION_KEY` env (32 bytes, base64).
Never log secrets; never return them from any API — `GET /api/connections` returns `meta` only.
Shopify stores **no long-lived secret** (tokens are vended per-use, §6.1).

---

## 6. Connectors

All external API access lives in `server/connectors/`. Each connector exports:

```js
export async function probe(connection, config)   // → { ok, fields: [{ name, present, sample? }], error? }
export async function fetchData(connection, config, watermark)  // → rows keyed by destination table
```

### 6.1 Shopify — via the Smart Layer connector app (the onboarding anchor)

The Smart Layer Shopify app (separate repo — the "AI Data Analytics Smart DB Connector", a zero-DB
OAuth token-vending tunnel) is how every brand connects. **Contract (finalize field names against
the connector repo before implementing; the shape below is the working agreement):**

1. **Install hook** — connector calls us when a merchant installs the app:
   `POST /api/hooks/connector/install` body `{ shop_domain, email }`, HMAC-signed with shared
   secret `CONNECTOR_WEBHOOK_SECRET`. Handler is idempotent: find-or-create workspace by
   `shop_domain`, create a `shopify` connection, invite `email` as admin.
2. **Token vending** — server-side, per request batch:
   `GET {CONNECTOR_URL}/api/token?shop={shop_domain}` with `Authorization: Bearer {CONNECTOR_API_KEY}`
   → `{ access_token, expires_at }`. Cache in-memory until `expires_at - 60s`. On 401/404 mark the
   connection `status='error'` (merchant uninstalled).
3. All Shopify reads use Admin **GraphQL** (2025-01) with the vended token. Queries needed:
   - Daily orders rollup: `orders(query: "created_at:>=X created_at:<=Y")` → count, `currentTotalPriceSet`, line-item quantities → `shopify_daily`, `shopify_products`.
   - Catalog: `products` (id, title, handle, status, variants → sku, inventoryQuantity) → product dimension + OOS input.
   - Fallback path: a connection can also be created manually with a pasted Admin token (`meta.manual_token` encrypted) for brands not using the app — same GraphQL layer, different token source.

### 6.2 Google Analytics 4 — per-workspace OAuth

- OAuth 2.0 web flow: `GET /api/connections/google/oauth/start?workspace=...` → Google consent
  (scope `https://www.googleapis.com/auth/analytics.readonly`, `access_type=offline`,
  `prompt=consent`) → `/api/connections/google/oauth/callback` stores encrypted `refresh_token`.
  Google Cloud project + client id/secret are ours, in env (`GOOGLE_CLIENT_ID/SECRET`).
- After connect: list properties via Analytics Admin API (`properties.list` per account summary) →
  cached in `connections.meta.properties` → the setup form's property picker.
- `runReport` wrapper with retry/backoff and the standard quota guards.
- **Probe**: run a 1-day `runReport` with the report's required dimensions/metrics; a field is
  `present:false` if the API rejects it or (for event-based fields) returns no such event name.

### 6.3 Meta — CSV upload (v1)

Port `server/services/metaParser.js` from GNC **unchanged** (it's battle-tested, including the
`(account total)` sentinel and budget-column handling). The setup form for the Meta tab shows the
exact required/optional column checklist (§8) and the probe runs the parser against the uploaded
file headers. Upload endpoint: `POST /api/uploads/meta` (multipart), workspace-scoped, upserts on
the natural key so re-uploads overwrite in place.

### 6.4 VWO — API token. Probe = fetch account details + one campaign page.

### 6.5 PSI — API key + list of URLs (form setting). Daily cron run per URL → `psi_daily`.

---

## 7. Report definition framework (the heart)

`server/reports/registry.js` exports `REPORT_DEFINITIONS` — an ordered array; each entry:

```js
{
  id: 'cro',                      // stable — used in report_configs.report_id and client routing
  title: 'CRO',
  sourceType: 'ga4',              // which connector + which connection types are eligible
  requires: {                     // drives the form's field checklist AND the probe
    // shape depends on sourceType:
    // ga4:      { dimensions: [...], metrics: [...], events: [...] }
    // shopify:  { scopes: [...], queries: [...] }
    // meta-csv: { columns: [{ name, required }] }
  },
  settings: [                     // rendered as form step 3; stored in report_configs.config.settings
    { key: 'anomaly_min_sessions', label: 'Min sessions to flag', type: 'number', default: 100 },
    ...
  ],
  cadenceOptions: ['manual', '2h', 'daily'],
  storage: ['cro_daily', 'anomalies'],   // destination tables (documentation + rebuild scoping)
}
```

The client gets this registry via `GET /api/reports` (definitions + this workspace's config
status merged in) and builds both the tab bar and the setup forms from it. **Adding a new tab =
adding a registry entry + a connector/compute function + a dashboard component. Nothing else.**

### Report config lifecycle

```
draft ──(probe all required fields ✓)──> validated ──(first sync ok)──> live
   ▲                                                                     │
   └──────────────(probe fails / sync error: status=error, last_error)◄──┘
```

The tab UI switches on this status: `draft|error` → SetupForm with checklist; `validated` →
"Syncing…" state; `live` → the dashboard component.

---

## 8. Report definitions — v1 contents (exact fields)

**`summary`** — no source; aggregates whatever other tabs are `live`. Cards only render for
configured tabs (port SummaryTab's severity-sorted card grid).

**`products`** (Shopify): requires Shopify connection. Queries: daily orders rollup, catalog +
inventory. Settings: `oos_session_threshold` (default 500), `low_stock_threshold` (default 10),
`product_aliases` (key→value list, e.g. `pp → whey` — **the GNC hardcoded alias map becomes this
setting**). Storage: `shopify_daily`, `shopify_products`, `oos_log`.

**`cro`** (GA4, web property): 
- metrics: `sessions`, `addToCarts`, `checkouts`, `ecommercePurchases`
- event-based (dimension `eventName` + metric `eventCount`, filtered): `add_payment_info` (= RPP)
- dimensions: `date`
- Settings: anomaly thresholds (§9.3), `funnel_channels` (web/app/both).
- Storage: `cro_daily`, `anomalies`. Dashboard = ported CroDashboard (funnel, day trend, movers,
  page performance, session anomalies — all its current cards except sheet-fed RCA autopull; RCA
  notes stay as manual entries).

**`page-sessions`** (GA4, folded into CRO's sync): dimensions `date`,
`landingPagePlusQueryString`, `sessionSource`; metrics `sessions`, `addToCarts` → `page_sessions`.

**`ga-app`** (GA4, app property): dimensions `date`, `platform`; metrics `activeUsers`,
`newUsers`, `sessions`, `engagedSessions`, `screenPageViews`, `averageSessionDuration`,
`eventCount` → `ga_app_daily`.

**`meta`** (meta-csv): required columns — `Reporting starts`, `Reporting ends`, `Campaign name`,
`Day`, `Ad name`, `Ad set name`, `Amount spent`; optional (feature-gating) — `CTR (all)`, `CPM`,
`CPC`, `CTR (link)`, `Cost per landing page view`, `Cost per purchase`, `AOV`, `LC to LPV`,
`LPV to A2C`, `A2C to CI`, `A2C to Order`, `CI to Order`, `Website checkouts`,
`Website purchases`, `ROAS`, `Conversion rate`, `Landing page views`, `Link clicks`, `Hook Rate`,
`Cost per purchase_new_customer`, `Ad set budget`, `Campaign budget`, `Frequency` (Frequency
powers Ad Fatigue; absent column = that detector shows "needs Frequency column" instead of empty).
Settings: `campaign_aliases` (the pp/TSFO map — again, form not code), `stopwords_extra`.
Storage: `meta_reports`. Dashboard = ported MetaTab including the full Budget Leak Detector.

**`abtests`** (no external source): user-entered tests + editable Quarter Plan (the GNC hardcoded
quarter focus list becomes a settings text list). Storage: `ab_tests`.

**`vwo`** (vwo token): storage `vwo_campaigns`, ported VwoTab.

**`vitals`** (psi): settings: `urls` (list), `api_key`. Storage `psi_daily`, ported WebVitalsTab.

---

## 9. Computations (server/reports/compute/)

### 9.1 CRO funnel from GA4 (replaces the CRO sheet)

Per day, per channel (web property; app property if configured):
`sessions` → ATC = `addToCarts` → IC = `checkouts` (begin_checkout) → RPP = eventCount of
`add_payment_info` → Orders = `ecommercePurchases`. Derived: `atc_pct = atc/sessions*100`, etc. —
same derived columns as GNC's `cro_daily` so the ported components work untouched. Numbers will
differ slightly from the legacy sheet (GA4 API vs whatever the sheet pipeline did) — accepted.

### 9.2 OOS detection (replaces sheet-fed OOS log)

Inventory poll on the Products sync cadence: for each product, sellable quantity = sum of variant
`inventoryQuantity`. Transition tracking against `oos_log`:
- qty ≤ 0 and no open row → insert `{product_id, product_title, handle, sku, oos_since: today, status:'oos'}`.
- qty > 0 and open row → set `restocked_at = today, status:'restocked'`.
Sessions-while-OOS joins `page_sessions.landing_page` on product `handle` (port the GNC
`getOosWithSessions` logic).

### 9.3 Session anomalies (replaces the Anomaly_Log sheet — and removes its top-5/day cap)

Runs after each CRO/page-sessions sync, per landing page with ≥ `anomaly_min_sessions` (default
100) average daily sessions:
- `yesterday = sessions(D)`, `avg7 = mean(sessions(D-7..D-1))`, `prev7 = mean(sessions(D-14..D-8))`
- `session_delta = yesterday - avg7`; flag `session_drop` when `yesterday < avg7 × (1 - drop_pct)`
  (default `drop_pct` 0.30)
- `atc_delta` computed identically from `atc_count`; flag `mixed` when sessions stable but ATC drops.
- `trend = (sum7 - sumPrev7) / sumPrev7`
- `impact = |session_delta| × (1 + max(0, -trend))`
- Store **all** rows above threshold (no arbitrary top-N; `anomaly_max_per_day` setting, default 50,
  as a sanity cap). Upsert on (workspace_id, date, page, type).
Dashboard = ported `SessionAnomalies.jsx`, rendered inside the CRO tab (last section), reading
`/api/data/cro/anomalies`.

---

## 10. Frontend architecture & port map

- **Auth gate**: Supabase Auth (magic link). Session token attached by `useApi` as
  `Authorization: Bearer`, plus `x-workspace-id` header from the workspace switcher.
- **Shell**: workspace switcher (top-left) → tab bar built from `/api/reports` (definition order,
  with status badge per tab: ⚙ not configured / ⏳ syncing / ● live / ⚠ error).
- **SetupForm framework** (`client/src/setup/`): three steps (source → field checklist → settings),
  generated from the definition. FieldChecklist polls `POST /api/reports/:id/probe` and renders
  live ✓/✗ per field with the missing-field names verbatim (this is the "shows which fields are
  needed in the report" requirement).

**Port from GNC** (same filenames, adapted to workspace-scoped endpoints):
`DateRangePicker.jsx` (incl. SingleDatePicker), `SectionNav.jsx`, `CroDashboard.jsx` + `CroFunnel/
DayTrend/MainMovers/PagePerformance/CommerceSnapshot/RevenueLeak/SessionAnomalies`, `MetaTab.jsx`
(full Budget Leak Detector — aliases/stopwords move from constants to config fetched from the
report config), `ProductsTab.jsx`, `GaAppTab.jsx`, `SummaryTab.jsx` (cards gated on live tabs),
`VwoTab.jsx`, `WebVitalsTab.jsx`, `AbTestsTab.jsx` (Quarter Plan from settings), `SyncStatus.jsx`
(now per-workspace), `useApi.js`.

**Do not port**: HomePage floating-card intro (replaced by a plain tab grid + onboarding
checklist), ChatWidget (phase 3), RcaSnapshot's sheet autopull (manual notes only), GokwikTab,
GoogleAdsTab, anything touching `croSheets`/`sheetMirror`.

**New components**: `SetupForm`, `FieldChecklist`, `ConnectionsHub`, `WorkspaceSwitcher`,
`OnboardingChecklist` ("3 of 8 tabs configured — next: connect Google Analytics").

---

## 11. API surface (Express, all JWT + workspace-scoped except hooks)

```
POST /api/hooks/connector/install          # HMAC-verified, no JWT (connector-to-server)
GET  /api/workspaces                       # user's workspaces
POST /api/workspaces                       # manual create (non-Shopify-first onboarding)
GET  /api/connections                      # list (meta only, never secrets)
POST /api/connections                      # create (vwo/psi/manual-shopify)
GET  /api/connections/google/oauth/start   # → redirect URL
GET  /api/connections/google/oauth/callback
GET  /api/reports                          # registry + this workspace's config statuses
GET  /api/reports/:id/config
PUT  /api/reports/:id/config               # save draft
POST /api/reports/:id/probe                # run field checklist → {ok, fields[]}
POST /api/reports/:id/sync                 # manual sync now
POST /api/uploads/meta                     # CSV upload
GET  /api/data/:reportId/...               # per-tab data endpoints — port GNC routes/analytics.js
                                           # handlers one-to-one, adding workspace scoping
```

Response shapes of `/api/data/*` endpoints must match the GNC equivalents wherever a component is
ported, so ported components need only an endpoint-prefix change.

---

## 12. Sync engine

`server/sync/engine.js` — `runSync(reportConfig)`:
1. Load connection, decrypt secret (or vend Shopify token).
2. Read watermark from `_sync_state(workspace_id, source=report_id)`.
3. `connector.fetchData(connection, config, watermark)` → rows per destination table.
4. Run compute steps (funnel, anomalies, OOS) where the definition declares them.
5. Upsert with `ON CONFLICT` natural keys (port GNC's `appendRows`/`dedupeByKey` — they're solid).
6. Advance watermark; set `report_configs.last_synced_at`, `status='live'`; on error set
   `status='error'`, `last_error`, and leave the watermark untouched (retry-safe).

Scheduler: every 15 min, find `live|validated` configs whose cadence is due; run serially per
workspace, parallel across workspaces (cap 3). Manual `POST /sync` jumps the queue.

---

## 13. Build phases & acceptance criteria

**Phase 0 — prove the pattern (Shopify end-to-end)**
Scaffold per §4 (fresh `server/`+`client/` skeletons; port `supabaseDb.js` core, `useApi`,
`DateRangePicker`, Tailwind config). Migrations 001–003 (control tables, data tables, RLS).
Auth gate + workspace resolution. Connector install hook + token vending client (mock the
connector with a fixture server until the contract is finalized). Products report: registry entry,
setup form with field checklist, probe, sync, ported ProductsTab rendering live data.
✅ *Accept*: a workspace created via the install hook, Products tab configured entirely through the
form, real Shopify data on screen, re-sync idempotent (upsert proven), RLS verified (second user
in another workspace sees nothing).

**Phase 1 — GA4 + CRO**
Google OAuth flow, property picker, `ga4.js` connector + probe. CRO funnel compute, anomalies
compute, page sessions. Port CroDashboard + all sub-cards + GaAppTab.
✅ *Accept*: CRO tab live for GNC workspace via forms only; anomalies computed in-house with >5/day
possible; GA App tab live on the app property.

**Phase 2 — Meta, VWO, Vitals, Summary**
CSV upload + ported parser + ported MetaTab (detector aliases from settings). VWO connector + tab.
PSI connector + tab. SummaryTab gated on live tabs. AB Tests + Quarter Plan settings.
✅ *Accept*: full GNC parity minus GoKwik/Google Ads/chat, all through forms.

**Phase 3 — operate at scale**
Scheduler UI (cadence per report), roles enforcement (viewer read-only), onboarding checklist,
error surfacing on tabs + a workspace health endpoint, second-brand dry run.
✅ *Accept*: onboarding a brand-new store (test dev store) takes < 30 minutes, zero code changes.

**Migration**: GNC onboards as workspace #1 **through the forms** — that is the product's
acceptance test. The gnc-smart-layer deployment keeps running until parity is confirmed, then
becomes the permanent sandbox (§2).

---

## 14. Non-goals (v1)

SDLC/ticket integrations; GoKwik; Google Ads; Meta Marketing API; chat widget; per-brand theming;
billing; public signup (workspaces are created via connector install or by us).

## 15. Environment variables

```
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET
ENCRYPTION_KEY                # 32-byte base64, for connection secrets
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI
CONNECTOR_URL / CONNECTOR_API_KEY / CONNECTOR_WEBHOOK_SECRET
PORT (3000)
```
