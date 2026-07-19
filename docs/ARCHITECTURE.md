# Smart Layer — Architecture & Build Specification

**Status**: Approved for build. This document is the single source of truth for the dev agent executing the build.
**Read this entire document before writing any code.** This supersedes any earlier draft — the
core model changed from "own a data warehouse" to "zero-DB connection broker" on 2026-07-20;
see §1.1 for why.

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

### 1.1 Zero-DB connection broker (core architectural decision)

**Smart Layer does not store or duplicate any brand's business data.** It is a broker: it stores
*where and how to ask* for a brand's data (workspaces, connections, credentials/endpoints) and
queries each source **live, at render time**, through that source's own query API. There is no
sync engine, no watermark-based ETL, no `shopify_daily`/`cro_daily`-style mirrored tables. This is
the same pattern the existing Smart Layer Shopify connector app already uses ("zero-DB OAuth
token-vending tunnel") — Smart Layer generalizes it across every source type.

This was a deliberate reversal of the first draft of this document, which proposed a full
per-workspace Postgres warehouse (GNC's `TAB_SCHEMAS`/`UPSERT_KEYS` model, just workspace-scoped).
That model does not scale operationally — every brand added means more sync jobs, more storage,
more staleness/watermark bugs to debug. The broker model trades a small amount of request-time
latency (and source API rate-limit management, see §9.4) for **zero data-ownership burden**.

**What Smart Layer's own DB (§5) actually holds**: workspaces, connections (encrypted
credentials/endpoints), report configs (which reports are on, with what settings), and — the
narrow exception — the handful of sources that have **no live query API to broker**, where Smart
Layer is unavoidably the system of record: uploaded Meta CSVs, user-entered AB tests, RCA notes.
Everything else (Shopify, GA4, VWO, PSI, Metabase) is queried live through its connection.

### Data sources — final list (v1)

| Source | Auth | Query pattern | Feeds |
|---|---|---|---|
| **Shopify** | Smart Layer Shopify app — merchant pastes its fixed proxy key into ConnectionsHub | live GraphQL, proxied through the connector app | Orders/revenue/units, catalog, inventory/OOS |
| **Google Analytics 4** | Per-workspace Google OAuth | live GA4 Data API `runReport` per request | CRO funnel, page sessions, session anomalies (computed on the fly), GA App tab |
| **Metabase** | Per-workspace Metabase base URL + API key | live Metabase Query API (`/api/card/:id/query` or ad-hoc dataset query) per request | Any tab, for brands whose data already lives in a warehouse behind Metabase |
| **Meta Ads** | CSV upload (no live API in v1) | **stored** — Smart Layer is the source of record for uploaded rows | Meta tab incl. Budget Leak Detector |
| **VWO** | API token | live VWO REST per request | AB test results |
| **PageSpeed Insights** | API key + URL list | live PSI API per request | Web Vitals |

**There are no Google Sheets anywhere in this product.** No service accounts, no Apps Script, no
sheet mirrors, no email parsing. GoKwik and Google Ads are explicitly out of v1.

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

**Note**: GNC's sandbox is itself a *stored* model (it syncs into its own `shopify_daily` etc.
tables) — that's fine and stays that way; it's a single-brand lab, not the product. Only
*dashboard components and client-side logic* (charts, detectors, form UI) promote across; the data
layer does not, because the two repos' data layers are architecturally different on purpose.

**Conventions that keep cherry-picks clean — these are rules, not suggestions:**
1. Keep `client/src/components/` file names and paths **identical across both repos** wherever a
   component exists in both (e.g. `DateRangePicker.jsx`, `MetaTab.jsx`, `SessionAnomalies.jsx`).
2. One component/concern per commit. Never mix a shared-component change with server/data-layer
   changes in the same commit.
3. UI components must not import server-specific assumptions; all data arrives via props/hooks from
   `/api/...` endpoints. Response *shapes* should match GNC's where a component is ported, even
   though GNC's data is pre-synced and Smart Layer's is queried live — the client can't tell the
   difference and shouldn't need to.

What syncs well: client components, client-side analytics/detector logic (e.g. Budget Leak
Detector), parsers (`metaParser`), styling. What never syncs: `server/db/*`, connectors, auth,
anything workspace-related (GNC has no workspaces).

---

## 3. Stack

- **Backend**: Node.js + Express (port 3000), ESM.
- **Frontend**: Vite + React + Tailwind CSS (port 5173). **No external UI/chart/date libraries** —
  all visual components are hand-rolled (SVG charts, custom date pickers). Keep it that way.
- **Control-plane DB**: Supabase Postgres — **reused project**, not a new one. Smart Layer gets its
  own schema (`smart_layer`) inside the existing `ai-data-analytics-smart-db-connector` project
  (ref `jwyiwddltautdngljqja`, ap-south-1), which is already the Shopify connector app's own
  control-plane-only database. This keeps the org within its 2-active-free-project cap without
  touching the GNC sandbox project (`ycrdocpkkzhwxpmdpsfn`) or paying for a third. The connector
  app's own tables live in `public` (Prisma-managed) and are untouched; Smart Layer's tables live
  entirely in `smart_layer.*`. RLS on, no public policies. Server-only service-role key. Migration
  already applied: `smart_layer_control_plane` (see §5).
- **Auth**: Supabase Auth (email magic-link) against the same project's `auth.users` — the
  connector app doesn't use Supabase Auth (it uses Shopify's own session/token model via its
  `Session`/`shopify_sessions` tables), so there's no collision.
- **Request-time caching**: short-TTL in-memory cache (per connector, keyed by connection+query) to
  keep repeated dashboard loads fast and stay under source API rate limits — NOT a database. A
  cache entry disappearing just means the next request re-queries the source; no data is "lost."

⚠️ **Pre-existing, unrelated finding**: RLS is currently disabled on 4 tables in the connector
project's `public` schema (`proxy_keys`, `shopify_sessions`, `shopify_sessions_migrations`,
`one_time_charges`) — flagged to the user 2026-07-20, not fixed (fixing needs policies designed
first or it locks the connector app out of its own tables). Do not assume this is fixed; don't let
Smart Layer code touch those tables.

---

## 4. Target repo layout

```
smart-layer/
├── docs/ARCHITECTURE.md        # this file
├── SYNC.md                     # two-repo sync workflow
├── server/
│   ├── index.js                # Express bootstrap, JWT middleware, route mounting
│   ├── db/
│   │   ├── supabaseDb.js       # client + tiny helpers for the smart_layer.* control-plane tables
│   │   └── migrations/         # SQL files, applied via Supabase MCP, numbered 001_...
│   │                           # 001 already applied directly (workspaces/members/connections/report_configs)
│   ├── auth/
│   │   ├── jwt.js               # verify Supabase JWT → req.user
│   │   └── workspace.js         # resolve + authorize req.workspace from header `x-workspace-id`
│   ├── crypto/secrets.js       # AES-256-GCM encrypt/decrypt for connection secrets (ENCRYPTION_KEY env)
│   ├── connectors/             # one module per source type — the ONLY code that talks to external APIs.
│   │   │                       # Each is stateless: given a connection + query params, returns rows.
│   │   │                       # Nothing here writes to our own DB except meta.js (uploads).
│   │   ├── shopify.js          # proxies GraphQL through the connector app using the pasted proxy key
│   │   ├── ga4.js              # OAuth flow, property listing, live runReport wrapper, probe
│   │   ├── metabase.js         # live Query API calls against a brand's Metabase instance
│   │   ├── meta.js             # CSV parse (ported metaParser.js) + column probe + upload storage
│   │   ├── vwo.js              # live VWO REST + probe
│   │   └── psi.js              # live PSI API + probe
│   ├── reports/
│   │   ├── registry.js         # REPORT_DEFINITIONS (see §7) — the heart of the product
│   │   └── compute/            # pure functions computed ON EACH REQUEST from live connector data
│   │       │                   # (no cron, no persistence — see §9)
│   │       ├── croFunnel.js    # GA4 events → funnel rows, computed per request
│   │       ├── anomalies.js    # anomaly detection over a rolling GA4 window, computed per request
│   │       └── oos.js          # OOS detection from a live Shopify inventory snapshot vs. previous snapshot
│   ├── cache/liveCache.js      # short-TTL in-memory memoization wrapper used by connectors
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

## 5. Data model (control plane only)

**Project**: `jwyiwddltautdngljqja` ("ai-data-analytics-smart-db-connector"), schema `smart_layer`.
Migration `smart_layer_control_plane` already applied (2026-07-20). Every table below already
exists — do not re-create; add further migrations for anything new.

```sql
smart_layer.workspaces        (id uuid pk, name text, slug text unique,
                               shop_domain text unique,  -- set by connector install; nullable until then
                               created_at timestamptz)

smart_layer.workspace_members (workspace_id uuid fk, user_id uuid fk auth.users,
                               role text check in ('admin','viewer'), pk (workspace_id, user_id))

smart_layer.connections       (id uuid pk, workspace_id uuid fk, type text check in
                               ('shopify','ga4','meta-csv','vwo','psi','metabase'),
                               label text, secret_ciphertext text,  -- AES-256-GCM(JSON); null where
                               -- nothing to store, e.g. Shopify token vended live by the connector app
                               meta jsonb,  -- non-secret addressing: shop_domain, ga_property_id,
                               -- metabase_base_url + question_ids, psi urls...
                               status text check in ('active','error','revoked'), last_error text,
                               created_at, updated_at)

smart_layer.report_configs    (id uuid pk, workspace_id uuid fk, report_id text,
                               connection_id uuid fk, config jsonb,  -- settings + field mapping
                               status text check in ('draft','validated','live','error'),
                               last_error text, created_at, updated_at,
                               unique (workspace_id, report_id))
```

RLS: enabled on all four, one `select`-only policy each (`workspace_id in (member's workspaces)`).
**No insert/update/delete policies** — all writes go through Express with the service-role key,
which enforces workspace scoping itself via `req.workspace`. Same posture as GNC.

### 5.2 The narrow "we are the source of record" tables (add when building Meta/AB Tests/RCA — not yet created)

These are the only tables that will hold actual brand data, because there's no live API to broker
against (a CSV upload, or manually entered notes). Add via a new migration when Phase 2 builds
these tabs:

```sql
smart_layer.meta_uploads  (workspace_id uuid fk, + GNC's meta_reports column list,
                           unique (workspace_id, campaign_name, ad_name, reporting_start, reporting_end))
smart_layer.ab_tests      (workspace_id uuid fk, + GNC's ab_tests column list, serial id)
smart_layer.rca_notes     (workspace_id uuid fk, + GNC's rca_notes column list, serial id)
```

### 5.3 Secrets

`connections.secret_ciphertext` = AES-256-GCM of a JSON blob (`{refresh_token}` for GA4,
`{api_token}` for VWO, `{api_key}` for PSI, `{api_key, base_url}` for Metabase). Key from
`ENCRYPTION_KEY` env (32 bytes, base64). Never log secrets; never return them from any API —
`GET /api/connections` returns `meta` only. Shopify's secret is `{ proxy_key }` — the merchant's
fixed key from the connector app, pasted by hand like every other source (§6.1).

---

## 6. Connectors

All external API access lives in `server/connectors/`. Each connector exports:

```js
export async function probe(connection, config)   // → { ok, fields: [{ name, present, sample? }], error? }
export async function query(connection, config, params)  // → rows, called live on every dashboard request
                                                           // (wrap with server/cache/liveCache.js for hot paths)
```

There is no `fetchData`-into-storage step for live sources — `query()` is called directly from the
`/api/data/:reportId/...` route handler for every dashboard render, and the result flows straight
to the client. Compute steps (§9) sit between `query()` and the response for CRO/anomalies/OOS.

### 6.1 Shopify — via the Smart Layer connector app, as a GraphQL proxy (confirmed 2026-07-20)

**Onboarding is manual paste, not an install webhook.** Confirmed by reading the connector app's
own `CLAUDE.md` (`ai-data-analytics-smart-db-connector` repo): it is a **fixed-key GraphQL proxy**,
not a token vendor, and it never calls out to Smart Layer. A merchant installs it via standard
Shopify OAuth, and it shows them **one fixed key** (`sdbc_live_<hex>`) in its own UI, full stop.
The merchant then creates a Smart Layer workspace by hand (`CreateWorkspace` in `App.jsx`, hitting
the already-existing `POST /api/workspaces`) and pastes that key into `ConnectionsHub` as a
`shopify` connection — same paste-a-key shape as every other source type (§1.1 was updated to
match: this decision generalizes to GA4/VWO/PSI/Metabase too, see §6.2's note).

The earlier draft of this section (install webhook + `GET /api/token` vending) described a
contract that turned out not to exist and was never implemented as such — `server/routes/hooks.js`
was deleted. The real flow:

1. **Connection**: `connections.secret_ciphertext = { proxy_key: "sdbc_live_..." }`, entered via
   `ConnectionsHub`. No `shop_domain` needed in `meta` — the connector resolves the shop from the
   fixed key itself.
2. **Every query** goes through the connector's own proxy, not directly to Shopify:
   `POST {CONNECTOR_URL}/api/graphql`, `Authorization: Bearer <proxy_key>`, body
   `{ query, variables }` — the connector refreshes Shopify's underlying expiring token internally
   and forwards the query, returning Shopify's GraphQL response verbatim (`{ data, errors? }`).
   Smart Layer never sees a raw Shopify access token. `CONNECTOR_URL` is the only global env var
   needed (no `CONNECTOR_API_KEY`/`CONNECTOR_WEBHOOK_SECRET` — those never existed).
3. Queries used, same as before: commerce snapshot via `orders(query: "created_at:>=X
   created_at:<=Y")` → count, `currentTotalPriceSet`, line-item quantities; catalog + inventory via
   `products` (id, title, handle, status, variants → sku, inventoryQuantity) — OOS state derived by
   diffing this live snapshot against the *previous* one held only in `liveCache` (§9.2).
4. Note the connector's `CLAUDE.md` also flags: it isn't deployed anywhere permanent yet (planned
   Hostinger VPS); local dev uses `shopify app dev`'s temporary tunnel, whose URL changes every
   run — `CONNECTOR_URL` needs updating each time during that phase.

### 6.2 Google Analytics 4 — per-workspace OAuth

- OAuth 2.0 web flow: `GET /api/connections/google/oauth/start?workspace=...` → Google consent
  (scope `analytics.readonly`, `access_type=offline`, `prompt=consent`) →
  `/api/connections/google/oauth/callback` stores encrypted `refresh_token`. Our own Google Cloud
  OAuth client (`GOOGLE_CLIENT_ID/SECRET` env), not a service account.
- After connect: list properties via Analytics Admin API → cached in `connections.meta.properties`
  (this is addressing metadata, not brand data — fine to store) → the setup form's property picker.
- `query()` wraps `runReport` with retry/backoff and standard quota guards; results pass through
  `liveCache` with a short TTL (a few minutes) since GA4 has real rate limits and dashboards get
  refreshed/re-rendered often.
- **Probe**: run a 1-day `runReport` with the report's required dimensions/metrics; a field is
  `present:false` if the API rejects it or an event-based field has no matching event name.

### 6.3 Metabase — live Query API (new source type, not in GNC)

For brands whose data already lives in a warehouse fronted by Metabase. Connection stores
`meta.base_url` + encrypted `api_key` (or session-based auth token). `query()` calls Metabase's
REST API:
- Preferred: `POST /api/card/:id/query` against a pre-built Metabase "question" the brand points us
  to (form setting: `metabase_question_id` per report). Required-fields probe checks the returned
  column names against the report definition's `requires` list.
- Fallback: `POST /api/dataset` with a raw MBQL/native query, for brands willing to give us a
  direct query definition instead of a saved question. Treat this as advanced/optional in v1 — the
  saved-question path is the primary supported flow, keep the raw-query path behind a config flag.
Any report definition can name `metabase` as an *alternative* `sourceType` alongside its primary
one (e.g. CRO's `requires` shape is defined once; either GA4 or Metabase can satisfy it if the
column/field names line up) — see §7.

### 6.4 Meta — CSV upload (v1) — the one stored-data exception

Port `server/services/metaParser.js` from GNC **unchanged** (battle-tested, including the
`(account total)` sentinel and budget-column handling). `POST /api/uploads/meta` (multipart),
workspace-scoped, upserts into `smart_layer.meta_uploads` on the natural key (§5.2) so re-uploads
overwrite in place — this is genuinely "our" data, there is no live API to broker instead. The
setup form's field checklist runs the parser against just the uploaded file's headers (no data
write) to validate before commit.

### 6.5 VWO — live API token. `query()` = live account/campaign fetch, no storage, short cache.

### 6.6 PSI — API key + list of URLs (a form setting, stored in `connections.meta.urls` — addressing
metadata, not brand data). `query()` runs PSI live per URL; cache TTL matches the tab's own refresh
cadence since PSI runs are slow and rate-limited (this is the one connector where the cache TTL
should be tens of minutes, not seconds).

---

## 7. Report definition framework (the heart)

`server/reports/registry.js` exports `REPORT_DEFINITIONS` — an ordered array; each entry:

```js
{
  id: 'cro',                      // stable — used in report_configs.report_id and client routing
  title: 'CRO',
  sourceTypes: ['ga4', 'metabase'], // any connection of these types can satisfy this report
  requires: {                     // drives the form's field checklist AND the probe;
                                   // shape depends on sourceType — ga4: {dimensions,metrics,events};
                                   // metabase: {columns:[{name,required}]}; shopify: {queries:[...]}
  },
  settings: [                     // rendered as form step 3; stored in report_configs.config.settings
    { key: 'anomaly_min_sessions', label: 'Min sessions to flag', type: 'number', default: 100 },
  ],
  cache: { ttlSeconds: 120 },     // per-report override of the default live-cache TTL
  compute: 'croFunnel',           // optional — name of a server/reports/compute/* function to run
                                   // on the raw connector rows before responding
}
```

The client gets this registry via `GET /api/reports` (definitions + this workspace's config status
merged in) and builds both the tab bar and the setup forms from it. **Adding a new tab = adding a
registry entry + a connector `query()`/probe (if a new source type) + a dashboard component.**

### Report config lifecycle

```
draft ──(probe all required fields ✓)──> validated ──(first live query succeeds)──> live
   ▲                                                                                  │
   └───────────────────(probe fails / a live query errors: status=error, last_error)◄─┘
```

No watermark, no "last synced at" in the meaningful sense — `live` just means "the last query we
tried against this config succeeded." The tab UI switches on this status: `draft|error` →
SetupForm with checklist; `validated` → first-load spinner; `live` → the dashboard component,
re-querying live on every visit/date-range change.

---

## 8. Report definitions — v1 contents (exact fields)

Unchanged from source-of-truth field lists in the previous draft, EXCEPT: every `storage:` line is
gone (nothing is stored) and `sourceType` is now `sourceTypes` (array, ga4 or metabase where
applicable).

**`summary`** — no source; aggregates whatever other tabs are `live` by calling their own `/api/data`
endpoints. Cards only render for configured tabs.

**`products`** (`sourceTypes: ['shopify']`): live orders rollup + catalog/inventory queries.
Settings: `oos_session_threshold` (default 500), `low_stock_threshold` (default 10),
`product_aliases` (key→value list, e.g. `pp → whey` — the GNC hardcoded alias map becomes this
setting). No storage — see §9.2 for what "OOS history" means without a persisted log.

**`cro`** (`sourceTypes: ['ga4', 'metabase']`):
- GA4: metrics `sessions`, `addToCarts`, `checkouts`, `ecommercePurchases`; event-based
  `add_payment_info` (= RPP); dimension `date`.
- Metabase: `requires.columns` = `[date, sessions, add_to_carts, checkouts, add_payment_info,
  purchases]` — the brand's saved question must return these column names (or be mapped in the
  form's field-mapping step).
- Settings: anomaly thresholds (§9.3), `funnel_channels` (web/app/both).
- `compute: 'croFunnel'`. Dashboard = ported CroDashboard (funnel, day trend, movers, page
  performance, session anomalies).

**`page-sessions`** (folded into CRO's query, same connection): `date`,
`landingPagePlusQueryString`/landing page column, `sessionSource`, `sessions`, `addToCarts`.

**`ga-app`** (`sourceTypes: ['ga4']`, app property): dimensions `date`, `platform`; metrics
`activeUsers`, `newUsers`, `sessions`, `engagedSessions`, `screenPageViews`,
`averageSessionDuration`, `eventCount`.

**`meta`** (`sourceTypes: ['meta-csv']`): required columns — `Reporting starts`, `Reporting ends`,
`Campaign name`, `Day`, `Ad name`, `Ad set name`, `Amount spent`; optional (feature-gating) — `CTR
(all)`, `CPM`, `CPC`, `CTR (link)`, `Cost per landing page view`, `Cost per purchase`, `AOV`, `LC to
LPV`, `LPV to A2C`, `A2C to CI`, `A2C to Order`, `CI to Order`, `Website checkouts`, `Website
purchases`, `ROAS`, `Conversion rate`, `Landing page views`, `Link clicks`, `Hook Rate`, `Cost per
purchase_new_customer`, `Ad set budget`, `Campaign budget`, `Frequency` (Frequency powers Ad
Fatigue; absent column = that detector shows "needs Frequency column" instead of empty). Settings:
`campaign_aliases` (pp/TSFO map — form, not code), `stopwords_extra`. Storage: **yes**, this is the
exception (§6.4, §5.2). Dashboard = ported MetaTab including the full Budget Leak Detector.

**`abtests`** (no external source; `sourceTypes: []`): user-entered tests + editable Quarter Plan
(the GNC hardcoded quarter focus list becomes a settings text list). Storage: yes (§5.2).

**`vwo`** (`sourceTypes: ['vwo']`): live, ported VwoTab.

**`vitals`** (`sourceTypes: ['psi']`): settings: `urls` (list). Live per-URL PSI runs, longer cache.

---

## 9. Computations (server/reports/compute/) — all computed live, per request, not scheduled

### 9.1 CRO funnel from GA4/Metabase

Per day, per channel: `sessions` → ATC → IC (begin_checkout) → RPP (add_payment_info) → Orders.
Derived: `atc_pct`, `ic_pct`, etc. Runs on the raw rows returned by the connector's `query()` for
the requested date range — genuinely computed fresh each time, wrapped in `liveCache` keyed by
`(workspace, connection, dateRange)` with a short TTL so flipping between tabs doesn't re-hit GA4
on every render.

### 9.2 OOS detection — the honest tradeoff of zero-DB

GNC's `oos_log` persists `oos_since`/`restocked_at` transitions over time — that's a genuine
history, only possible with storage. In the broker model there is **no persisted history**: the
Products connector's `query()` returns Shopify's *current* inventory snapshot, live, every time.
To approximate "since when," we diff against the **previous snapshot held in `liveCache`** (TTL
matched to the Products tab's polling cadence, e.g. 2 hours) — this gives "OOS as of the last N
snapshots we happened to take," not a durable audit trail. **This is a known, accepted limitation
of v1** — if a brand needs true OOS history/audit trail, that's a case for the `meta-csv`-style
"we are the source of record" exception (a dedicated `oos_snapshots` table), to be added if/when a
real brand asks for it. Don't build it speculatively now.

### 9.3 Session anomalies

Runs per request against a rolling window of live GA4/Metabase query results (no cron): for each
landing page with ≥ `anomaly_min_sessions` average daily sessions, compare yesterday vs. 7-day avg
vs. prior-7-day avg, same formulas as GNC (`session_delta`, `atc_delta`, `trend`, `impact`) — see
GNC's `docs/ARCHITECTURE.md` for the exact math, ported as-is. Output rows are **not stored**; the
tab shows whatever the current window computes. `anomaly_max_per_day` setting still applies as a
sanity cap on the response, default 50 — no arbitrary top-5.

### 9.4 Rate limits are now a first-class concern

Because everything is live, N dashboard loads = up to N source API calls. Mitigations, in order of
preference: (1) `liveCache` TTL per connector/report (§7 `cache.ttlSeconds`), (2) batch multiple
dashboard widgets that need the same date range into one connector call where the source API
supports it (GA4 `runReport` can return multiple metrics/dimensions in one call — always prefer
this over N separate calls), (3) client-side: don't re-fetch on every re-render, only on
date-range/tab change (standard `useApi` hook behavior, unchanged from GNC). If a source's rate
limit is hit, surface `status='error'` with `last_error` on that report config rather than
retry-storming.

---

## 10. Frontend architecture & port map

Same as before — **no changes here**, the client doesn't know or care whether server data is live
or synced:

- **Auth gate**: Supabase Auth (magic link). Session token via `useApi` as `Authorization: Bearer`,
  plus `x-workspace-id` header from the workspace switcher.
- **Shell**: workspace switcher (top-left) → tab bar built from `/api/reports` (definition order,
  with status badge per tab: ⚙ not configured / ⏳ syncing / ● live / ⚠ error).
- **SetupForm framework** (`client/src/setup/`): three steps (source → field checklist → settings),
  generated from the definition. FieldChecklist polls `POST /api/reports/:id/probe`.

**Port from GNC** (same filenames): `DateRangePicker.jsx` (incl. SingleDatePicker),
`SectionNav.jsx`, `CroDashboard.jsx` + sub-cards incl. `SessionAnomalies.jsx`, `MetaTab.jsx` (full
Budget Leak Detector — aliases/stopwords from config, not constants), `ProductsTab.jsx`,
`GaAppTab.jsx`, `SummaryTab.jsx`, `VwoTab.jsx`, `WebVitalsTab.jsx`, `AbTestsTab.jsx`,
`SyncStatus.jsx` → rename/repurpose as **`ConnectionStatus.jsx`** (per-workspace connection health,
not a sync watermark display — no watermarks exist anymore), `useApi.js`.

**Do not port**: HomePage floating-card intro, ChatWidget (phase 3), RcaSnapshot's sheet autopull
(manual notes only), GokwikTab, GoogleAdsTab, anything sheet-related.

**New components**: `SetupForm`, `FieldChecklist`, `ConnectionsHub`, `WorkspaceSwitcher`,
`OnboardingChecklist`.

---

## 11. API surface (Express, all JWT + workspace-scoped except hooks)

```
POST /api/hooks/connector/install          # HMAC-verified, no JWT (connector-to-server)
GET  /api/workspaces                       # user's workspaces
POST /api/workspaces                       # manual create (non-Shopify-first onboarding)
GET  /api/connections                      # list (meta only, never secrets)
POST /api/connections                      # create (vwo/psi/metabase/manual-shopify)
GET  /api/connections/google/oauth/start
GET  /api/connections/google/oauth/callback
GET  /api/reports                          # registry + this workspace's config statuses
GET  /api/reports/:id/config
PUT  /api/reports/:id/config               # save draft
POST /api/reports/:id/probe                # run field checklist → {ok, fields[]}
POST /api/uploads/meta                     # CSV upload (the one stored-data path)
GET  /api/data/:reportId/...               # per-tab data — calls connector.query() live,
                                           # runs compute/*, returns. Port GNC's
                                           # routes/analytics.js handler shapes 1:1 so ported
                                           # components need only an endpoint-prefix change.
```

No `/sync` routes, no scheduler, no `_sync_state` — removed entirely from this design vs. the
first draft.

---

## 12. Build phases & acceptance criteria

**Phase 0 — prove the pattern (Shopify end-to-end, live query-through)** — DONE 2026-07-20
Scaffold per §4. Migration already applied (§5). Auth gate + manual `CreateWorkspace` UI (no
install webhook — see §6.1). Products report: registry entry, setup form with field checklist,
probe, live `connectors/shopify.js` `query()` proxied through the connector app, fresh
(not-ported) ProductsTab rendering live data with no storage layer. Both apps running locally:
backend :3001, frontend :5174 (gnc-smart-layer sandbox keeps 3000/5173).
✅ *Accept*: a workspace created by hand, a Shopify proxy key pasted into ConnectionsHub, Products
tab configured entirely through the form, real Shopify data on screen fetched live through the
connector proxy (verify by checking Shopify Admin directly — no Smart Layer table has a copy), a
second call within the cache TTL doesn't re-hit the proxy (check `liveCache` hit), RLS verified
(second user in another workspace sees nothing). **Still blocked on**: real
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_JWT_SECRET` in `.env` (can't be fetched via any tool, must
come from the Supabase dashboard) and a reachable `CONNECTOR_URL` (connector isn't deployed yet).

**Phase 1 — GA4 + Metabase + CRO**
Google OAuth flow, property picker, `ga4.js` connector + probe + `croFunnel`/`anomalies` compute.
`metabase.js` connector + probe (saved-question path). Port CroDashboard + all sub-cards + GaAppTab.
✅ *Accept*: CRO tab live for a test workspace via GA4; a second test workspace configured against
a Metabase question instead, same dashboard component renders both; anomalies computed live with
no top-N cap; rate-limit mitigation (§9.4) verified under repeated tab switching.

**Phase 2 — Meta upload, VWO, Vitals, Summary**
`meta_uploads`/`ab_tests`/`rca_notes` migration (§5.2). CSV upload + ported parser + ported MetaTab.
VWO connector + tab. PSI connector + tab. SummaryTab gated on live tabs. AB Tests + Quarter Plan.
✅ *Accept*: full GNC parity minus GoKwik/Google Ads/chat, all through forms, nothing synced except
the Meta CSV rows.

**Phase 3 — operate at scale**
Roles enforcement (viewer read-only), onboarding checklist, error surfacing on tabs + a workspace
health endpoint, cache-hit-rate/rate-limit observability, second-brand dry run (ideally on Metabase
this time, to prove the non-Shopify-anchor path too).
✅ *Accept*: onboarding a brand-new store (test dev store) takes < 30 minutes, zero code changes.

**Migration**: GNC onboards as workspace #1 **through the forms**. The gnc-smart-layer deployment
keeps running (it's the permanent sandbox, §2) even after this.

---

## 13. Non-goals (v1)

SDLC/ticket integrations; GoKwik; Google Ads; Meta Marketing API (live); chat widget; per-brand
theming; billing; public signup (workspaces created via connector install, Metabase invite, or by
us). **Persisted OOS/anomaly history** is explicitly deferred (§9.2) — don't build it speculatively.

## 14. Environment variables

```
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET   # jwyiwddltautdngljqja project
ENCRYPTION_KEY                # 32-byte base64, for connection secrets
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI  # likely dropped for a
                               # paste-a-key GA4 flow before Phase 1 — see §6.1's note
CONNECTOR_URL                  # base URL only — it's a proxy the merchant's own pasted key
                               # authenticates against, no global connector credential needed
PORT (3001)                    # 3000/5173 belong to gnc-smart-layer's sandbox, see §2
```

## 15. Known open item

Row-Level Security is disabled on 4 tables in the shared Supabase project's `public` schema
(connector app's own tables: `proxy_keys`, `shopify_sessions`, `shopify_sessions_migrations`,
`one_time_charges`) — flagged to the user 2026-07-20, unresolved. Not caused by and out of scope
for Smart Layer's build, but worth knowing since we share the project.
