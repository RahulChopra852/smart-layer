import { useEffect, useState } from 'react';
import CommerceSnapshot from './CommerceSnapshot';
import SectionNav from './SectionNav';

const SUMMARY_SECTIONS = [
  { id: 'summary-commerce-snapshot', label: 'Commerce Snapshot' },
  { id: 'summary-kpis', label: 'Key Metrics' },
  { id: 'summary-source-cards', label: 'Source Cards' },
  { id: 'summary-top-campaigns', label: 'Top Google Ads Campaigns' },
];

// Harry Potter "Daily Prophet" reskin for this tab only. Scoped entirely to `.prophet-page` —
// overriding the same --color-* custom properties Tailwind's utilities already read from (see
// @theme in index.css) means every bg-card/text-accent/etc. class in this tree (including
// child components like CommerceSnapshot) repaints automatically, with zero changes needed
// anywhere else and zero risk of leaking into other tabs.
const PROPHET_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Playfair+Display:wght@600;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

.prophet-page {
  position: relative;
  --color-bg: #e9dbb3;
  --color-card: #f6edd3;
  --color-border: #6b4f2a;
  --color-text-primary: #241708;
  --color-text-secondary: #4a3520;
  --color-text-muted: #7c6845;
  --color-positive: #2f5233;
  --color-negative: #7a1f1f;
  --color-warning: #8a5a12;
  --color-accent: #7a2e2e;
  font-family: 'EB Garamond', Georgia, serif;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(139,111,60,0.15), transparent 45%),
    radial-gradient(ellipse at 80% 70%, rgba(139,111,60,0.12), transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(90,66,30,0.15), transparent 60%),
    var(--color-bg);
  padding: 1rem;
  border-radius: 0.5rem;
  box-shadow: inset 0 0 80px rgba(60, 40, 10, 0.25);
}
.prophet-page h1, .prophet-page h2, .prophet-page h3 {
  font-family: 'Playfair Display', Georgia, serif;
}
.prophet-masthead {
  position: relative;
  overflow: hidden;
  text-align: center;
  border-bottom: 4px double var(--color-text-primary);
  padding-bottom: 0.75rem;
  margin-bottom: 0.5rem;
}
.prophet-masthead::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 6px;
  height: 3px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.9), rgba(122,46,46,0.9), transparent);
  background-size: 50% 100%;
  animation: prophet-shimmer 2.5s linear infinite;
}
@keyframes prophet-shimmer {
  0% { background-position: -50% 0; }
  100% { background-position: 150% 0; }
}
.prophet-masthead-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-text-primary);
  padding-bottom: 0.35rem;
  margin-bottom: 0.5rem;
}
.prophet-title {
  font-family: 'UnifrakturMaguntia', 'Playfair Display', serif;
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  color: var(--color-text-primary);
  margin: 0.1rem 0;
  letter-spacing: 0.02em;
}
.prophet-subhead {
  font-style: italic;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}
.prophet-subhead::first-letter {
  font-family: 'Playfair Display', serif;
  font-size: 1.8em;
  font-weight: 700;
  float: left;
  line-height: 0.8;
  padding-right: 0.15rem;
  color: var(--color-accent);
}
@keyframes prophet-flicker {
  0%, 100% { opacity: 1; filter: brightness(1); }
  45% { opacity: 0.75; filter: brightness(1.3); }
  55% { opacity: 0.85; filter: brightness(0.9); }
}
.prophet-page .prophet-dot {
  animation: prophet-flicker 3.5s ease-in-out infinite;
}

/* "Moving photograph" effect — every card breathes gently, out of sync with its neighbors, plus
   a one-time staggered print-in on mount so the page feels like it's being set rather than just
   appearing. */
@keyframes prophet-breathe {
  0%, 100% { transform: scale(1) rotate(0deg); box-shadow: 0 1px 3px rgba(60,40,10,0.15); }
  50% { transform: scale(1.045) rotate(-0.9deg); box-shadow: 0 10px 18px rgba(60,40,10,0.3); }
}
@keyframes prophet-print-in {
  0% { opacity: 0; transform: translateY(24px) rotate(-2deg) scale(0.94); }
  70% { opacity: 1; transform: translateY(-4px) rotate(0.5deg) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
}
.prophet-page .prophet-card {
  animation: prophet-print-in 0.7s cubic-bezier(.2,.8,.3,1.2) both, prophet-breathe 4.5s ease-in-out infinite;
}
.prophet-page .prophet-card:nth-child(8n+1) { animation-delay: 0.02s, 0s; }
.prophet-page .prophet-card:nth-child(8n+2) { animation-delay: 0.1s, 0.4s; }
.prophet-page .prophet-card:nth-child(8n+3) { animation-delay: 0.18s, 0.8s; }
.prophet-page .prophet-card:nth-child(8n+4) { animation-delay: 0.26s, 1.2s; }
.prophet-page .prophet-card:nth-child(8n+5) { animation-delay: 0.34s, 1.6s; }
.prophet-page .prophet-card:nth-child(8n+6) { animation-delay: 0.42s, 2s; }
.prophet-page .prophet-card:nth-child(8n+7) { animation-delay: 0.5s, 2.4s; }
.prophet-page .prophet-card:nth-child(8n+8) { animation-delay: 0.58s, 2.8s; }
.prophet-page .prophet-card:hover {
  animation-play-state: running, paused;
}

/* Subtle candlelight flicker over the whole page background. */
@keyframes prophet-torchlight {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.55; }
}
.prophet-page::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(ellipse at 50% 0%, rgba(255, 220, 150, 0.5), transparent 60%);
  opacity: 0.3;
  animation: prophet-torchlight 5s ease-in-out infinite;
}
`;

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const fmt = (v) => v == null ? '—' : v.toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;

function useFetchAll() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoints = {
      croDaily: '/api/analytics/gokwik-daily',
      gokwikDaily: '/api/analytics/gokwik-daily',
      googleAdsDaily: '/api/analytics/google-ads-daily',
      googleAdsCampaigns: '/api/analytics/google-ads-campaigns',
      gaAppStored: '/api/analytics/ga-app-stored',
      metaReports: '/api/analytics/meta-reports',
      psiDaily: '/api/analytics/psi-daily',
      vwoCampaigns: '/api/analytics/vwo-campaigns',
      lowStock: '/api/analytics/low-stock',
      anomalies: '/api/analytics/anomalies',
    };

    Promise.all(
      Object.entries(endpoints).map(([key, url]) =>
        fetch(url).then(r => r.ok ? r.json() : {}).then(d => [key, d]).catch(() => [key, {}])
      )
    ).then(results => {
      const obj = {};
      results.forEach(([k, v]) => { obj[k] = v; });
      setData(obj);
      setLoading(false);
    });
  }, []);

  return { data, loading };
}

function SummaryCard({ title, tabId, onNavigate, metrics, lastDate, status }) {
  const statusColor = status === 'good' ? 'bg-positive' : status === 'warning' ? 'bg-warning' : status === 'error' ? 'bg-negative' : 'bg-border';
  // Cards needing action get a colored left accent to pop visually; healthy ones stay neutral
  // and slightly dimmed so they recede instead of competing for attention with equal weight.
  const emphasisBorder = status === 'error' ? 'border-l-4 border-l-negative' : status === 'warning' ? 'border-l-4 border-l-warning' : '';
  const dimmed = status === 'good' ? 'opacity-70' : '';

  return (
    <div className={`prophet-card bg-card border border-border rounded-lg p-4 hover:border-accent/40 hover:opacity-100 transition-colors ${emphasisBorder} ${dimmed}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full prophet-dot ${statusColor}`} />
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        <button onClick={() => onNavigate(tabId)}
          className="text-[10px] font-medium px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
          View →
        </button>
      </div>
      {lastDate && (
        <div className="text-[10px] text-text-muted mb-2">Last data: {lastDate}</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(({ label, value, color }) => (
          <div key={label}>
            <div className="text-[10px] text-text-muted">{label}</div>
            <div className={`text-sm font-semibold ${color || 'text-text-primary'}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Plays once per mount (see the `key={introKey}` remount trick in SummaryTab) — the GIF itself
// lives at client/public/prophet-owl-drop.gif (not committed yet). Until that file exists,
// onError hides it immediately instead of leaving a broken-image icon on screen for the full
// dismiss duration, so this is a safe no-op in the meantime.
function OwlDropIntro() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      onClick={() => setVisible(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
    >
      <img
        src="/prophet-owl-drop.gif"
        alt=""
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        className="max-w-[80vw] max-h-[80vh]"
      />
    </div>
  );
}

export default function SummaryTab({ onNavigate }) {
  const { data, loading } = useFetchAll();
  const [prophetMode, setProphetMode] = useState(() => localStorage.getItem('gnc-prophet-mode') !== 'off');
  // Bumped each time Prophet mode is switched back on, so <OwlDropIntro key={introKey}> remounts
  // and replays — a fresh mount is what re-triggers its own internal dismiss timer, rather than
  // driving that timer from an effect here that reacts to prophetMode changing.
  const [introKey, setIntroKey] = useState(0);

  useEffect(() => {
    localStorage.setItem('gnc-prophet-mode', prophetMode ? 'on' : 'off');
  }, [prophetMode]);

  function handleToggleProphet() {
    const next = !prophetMode;
    setProphetMode(next);
    if (next) setIntroKey(k => k + 1);
  }

  const toggleButton = (
    <button
      onClick={handleToggleProphet}
      className="text-xs font-medium px-3 py-1.5 rounded-full shadow-sm bg-card border border-border text-text-primary hover:border-accent/50 transition-colors whitespace-nowrap"
    >
      {prophetMode ? '📜 View Normal Page' : '🦉 View Prophet Edition'}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-text-muted gap-2">
        <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
        Loading summary...
      </div>
    );
  }

  // ── Google Ads ──
  const adsDaily = data.googleAdsDaily?.daily || [];
  const latestAds = adsDaily[0];
  const adsTotalCost = adsDaily.reduce((s, r) => s + (pf(r.total_cost) || 0), 0);
  const adsTotalConvVal = adsDaily.reduce((s, r) => s + (pf(r.total_conv_value) || 0), 0);
  const adsRoas = adsTotalCost > 0 ? adsTotalConvVal / adsTotalCost : 0;

  // ── GoKwik ──
  const gokwikDaily = data.gokwikDaily?.daily || [];
  const latestGokwik = gokwikDaily[0];
  const gokwikTotalOrders = gokwikDaily.reduce((s, r) => s + (pf(r.total_orders) || 0), 0);
  const gokwikPrepaid = gokwikDaily.reduce((s, r) => s + (pf(r.prepaid_orders) || 0), 0);

  // ── GA App ──
  const gaAppRows = data.gaAppStored?.daily || [];
  const latestGaApp = gaAppRows.length ? gaAppRows[gaAppRows.length - 1] : null;
  const gaAppSessions = gaAppRows.reduce((s, r) => s + (r.sessions || 0), 0);
  const gaAppUsers = gaAppRows.reduce((s, r) => s + (r.activeUsers || 0), 0);

  // ── Meta ──
  // '(account total)' is Meta's own CSV "Totals" row (see metaParser.js TOTAL_MARKER) — exclude
  // it from per-campaign sums/counts here, it'd otherwise double-count spend/purchases.
  const metaReports = data.metaReports?.reports || [];
  const metaCampaignRows = metaReports.filter(r => r.campaign_name !== '(account total)');
  const metaSpend = metaCampaignRows.reduce((s, r) => s + (pf(r.amount_spent) || 0), 0);
  const metaPurchases = metaCampaignRows.reduce((s, r) => s + (pf(r.website_purchases) || 0), 0);
  const latestMeta = metaReports[0];

  // ── PSI / Web Vitals ──
  const psiEntries = data.psiDaily?.entries || [];
  const latestPsi = psiEntries[0];
  const psiAlertCount = psiEntries.filter(e => e.alerts && e.alerts !== '0' && e.alerts !== '').length;

  // ── VWO ──
  const vwoCampaigns = data.vwoCampaigns?.campaigns || [];
  const vwoRunning = vwoCampaigns.filter(c => c.status === 'RUNNING').length;
  const vwoWinners = vwoCampaigns.filter(c => pf(c.improvement) > 0 && pf(c.confidence) >= 70).length;

  // ── OOS ──
  const oosAlerts = data.lowStock?.alerts || [];
  const oosCount = oosAlerts.filter(a => (pf(a.qty) || 0) === 0).length;
  const criticalCount = oosAlerts.filter(a => { const q = pf(a.qty) || 0; return q > 0 && q < 10; }).length;

  // ── Anomalies ──
  const anomalies = data.anomalies?.anomalies || [];

  // ── Google Ads Campaigns (top 3) ──
  const adsCampaigns = data.googleAdsCampaigns?.campaigns || [];
  const topCampaigns = adsCampaigns.slice(0, 3);

  // ── Source cards, data-driven so they can be severity-sorted and fed into the attention
  // banner below from one shared source of truth instead of duplicating each condition. ──
  const SEVERITY_RANK = { error: 0, warning: 1, good: 2 };
  const sourceCardsUnsorted = [
    {
      title: 'Google Ads', tabId: 'google-ads',
      status: !latestAds ? 'error' : adsRoas < 5 ? 'warning' : 'good',
      lastDate: latestAds?.date,
      attention: !latestAds ? 'No Google Ads data synced yet' : adsRoas < 5 ? `ROAS is ${adsRoas.toFixed(1)}x, below the 5x target` : null,
      metrics: [
        { label: 'Spend (latest)', value: fmtCur(pf(latestAds?.total_cost)), color: 'text-negative' },
        { label: 'ROAS', value: latestAds ? `${(pf(latestAds.roas) || 0).toFixed(1)}x` : '—', color: (pf(latestAds?.roas) || 0) >= 5 ? 'text-positive' : 'text-warning' },
        { label: 'Clicks', value: fmt(pf(latestAds?.total_clicks)) },
        { label: 'Conversions', value: fmt(Math.round(pf(latestAds?.total_conversions) || 0)) },
      ],
    },
    {
      title: 'GoKwik Orders', tabId: 'gokwik',
      status: latestGokwik ? 'good' : 'error',
      lastDate: latestGokwik?.date,
      attention: !latestGokwik ? 'No GoKwik data synced yet' : null,
      metrics: [
        { label: 'Orders (latest)', value: fmt(pf(latestGokwik?.total_orders)), color: 'text-accent' },
        { label: 'Prepaid', value: fmt(pf(latestGokwik?.prepaid_orders)), color: 'text-positive' },
        { label: 'COD', value: fmt(pf(latestGokwik?.cod_orders)), color: 'text-warning' },
        { label: 'Top Coupon', value: latestGokwik?.top_coupon || '—' },
      ],
    },
    {
      title: 'GA - App', tabId: 'ga-app',
      status: latestGaApp ? 'good' : 'warning',
      lastDate: latestGaApp?.date,
      attention: !latestGaApp ? 'No GA App data synced recently' : null,
      metrics: [
        { label: 'Total Sessions', value: fmt(gaAppSessions) },
        { label: 'Active Users', value: fmt(gaAppUsers) },
        { label: 'Latest Sessions', value: fmt(latestGaApp?.sessions) },
        { label: 'New Users', value: fmt(latestGaApp?.newUsers) },
      ],
    },
    {
      title: 'Meta Ads', tabId: 'meta',
      status: metaReports.length ? 'good' : 'warning',
      lastDate: latestMeta?.day || latestMeta?.reporting_start,
      attention: !metaReports.length ? 'No Meta reports uploaded yet' : null,
      metrics: [
        { label: 'Total Spend', value: fmtCur(metaSpend), color: 'text-negative' },
        { label: 'Purchases', value: fmt(metaPurchases), color: 'text-positive' },
        { label: 'Campaigns', value: fmt(new Set(metaCampaignRows.map(r => r.campaign_name)).size) },
        { label: 'Reports', value: fmt(metaReports.length) },
      ],
    },
    {
      title: 'Web Vitals (PSI)', tabId: 'vitals',
      status: psiAlertCount > 0 ? 'warning' : psiEntries.length ? 'good' : 'error',
      lastDate: latestPsi?.date,
      attention: psiAlertCount > 0 ? `${psiAlertCount} web vitals alert entries flagged` : !psiEntries.length ? 'No PSI data synced yet' : null,
      metrics: [
        { label: 'Pages Tracked', value: fmt(new Set(psiEntries.map(e => e.page)).size) },
        { label: 'Alert Entries', value: fmt(psiAlertCount), color: psiAlertCount > 0 ? 'text-warning' : 'text-positive' },
        { label: 'Latest Perf', value: latestPsi?.performance ? `${(pf(latestPsi.performance) * 100).toFixed(0) || latestPsi.performance}` : '—' },
        { label: 'Latest LCP', value: latestPsi?.lcp || '—' },
      ],
    },
    {
      title: 'VWO AB Tests', tabId: 'vwo',
      status: vwoRunning > 0 ? 'good' : 'warning',
      lastDate: vwoCampaigns[0]?.synced_at?.slice(0, 10),
      attention: vwoRunning === 0 ? 'No AB tests currently running' : null,
      metrics: [
        { label: 'Total Tests', value: fmt(vwoCampaigns.length) },
        { label: 'Running', value: fmt(vwoRunning), color: 'text-positive' },
        { label: 'Winners', value: fmt(vwoWinners), color: 'text-positive' },
        { label: 'Total Visitors', value: fmt(vwoCampaigns.reduce((s, c) => s + (pf(c.visitors) || 0), 0)) },
      ],
    },
    {
      title: 'Products & OOS', tabId: 'products',
      status: oosCount > 0 ? 'error' : criticalCount > 0 ? 'warning' : 'good',
      lastDate: new Date().toISOString().slice(0, 10),
      attention: oosCount > 0 ? `${oosCount} products out of stock` : criticalCount > 0 ? `${criticalCount} products critically low (<10 units)` : null,
      metrics: [
        { label: 'OOS Items', value: fmt(oosCount), color: oosCount > 0 ? 'text-negative' : 'text-positive' },
        { label: 'Critical (<10)', value: fmt(criticalCount), color: criticalCount > 0 ? 'text-warning' : 'text-positive' },
        { label: 'Low Stock Total', value: fmt(oosAlerts.length) },
        { label: 'Status', value: oosCount === 0 ? 'All Good' : `${oosCount} need restock`, color: oosCount === 0 ? 'text-positive' : 'text-negative' },
      ],
    },
    {
      title: 'Anomalies', tabId: 'cro',
      status: anomalies.length > 3 ? 'warning' : 'good',
      lastDate: anomalies[0]?.date,
      attention: anomalies.length > 3 ? `${anomalies.length} anomalies flagged across the funnel` : null,
      metrics: [
        { label: 'Total Flagged', value: fmt(anomalies.length), color: anomalies.length > 5 ? 'text-warning' : 'text-text-primary' },
        { label: 'Latest', value: anomalies[0]?.date || '—' },
        { label: 'CRO Tab', value: 'View funnel →' },
        { label: 'GA Web', value: 'View traffic →' },
      ],
    },
  ];

  const sourceCards = [...sourceCardsUnsorted].sort((a, b) => SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status]);
  const attentionItems = sourceCardsUnsorted.filter(c => c.attention);

  return (
    <div className={prophetMode ? 'prophet-page flex flex-col gap-4' : 'flex flex-col gap-4'}>
      {prophetMode && <style>{PROPHET_STYLES}</style>}

      {prophetMode && <OwlDropIntro key={introKey} />}

      <SectionNav sections={SUMMARY_SECTIONS} />

      {/* Masthead */}
      {prophetMode ? (
        <div className="prophet-masthead">
          <div className="absolute top-2 right-2">{toggleButton}</div>
          <div className="prophet-masthead-top">
            <span>Vol. I, No. 42</span>
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span>Price: 2 Knuts</span>
          </div>
          <h1 className="prophet-title">The GNC Prophet</h1>
          <p className="prophet-subhead">Overview of all data sources, delivered fresh by owl this very morning.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-1">Dashboard Summary</h2>
            <p className="text-xs text-text-muted">
              Overview of all data sources · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          {toggleButton}
        </div>
      )}

      {/* Needs Attention — pulls straight from the same status/attention fields that drive the
          source card sort below, so this list and the card order can never disagree. */}
      {attentionItems.length > 0 ? (
        <div className="bg-negative/5 border border-negative/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-negative mb-2">⚠ Needs Attention ({attentionItems.length})</h3>
          <ul className="flex flex-col gap-1.5">
            {attentionItems.map(c => (
              <li key={c.title}>
                <button
                  onClick={() => onNavigate(c.tabId)}
                  className={`text-xs text-left hover:underline ${c.status === 'error' ? 'text-negative' : 'text-warning'}`}
                >
                  {c.status === 'error' ? '🔴' : '🟠'} {c.attention} — {c.title} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-positive/5 border border-positive/30 rounded-lg p-4 text-sm text-positive font-medium">
          ✅ All sources healthy — nothing needs attention right now.
        </div>
      )}

      {/* Commerce Snapshot */}
      <div id="summary-commerce-snapshot"><CommerceSnapshot /></div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" id="summary-kpis">
        <div className="prophet-card bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">Google Ads Spend</div>
          <div className="text-xl font-bold text-negative">{fmtCur(adsTotalCost)}</div>
          <div className="text-[10px] text-text-muted">{adsDaily.length} days</div>
        </div>
        <div className="prophet-card bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">Ads ROAS</div>
          <div className={`text-xl font-bold ${adsRoas >= 5 ? 'text-positive' : 'text-warning'}`}>{adsRoas.toFixed(1)}x</div>
          <div className="text-[10px] text-text-muted">Conv value: {fmtCur(adsTotalConvVal)}</div>
        </div>
        <div className="prophet-card bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">GoKwik Orders</div>
          <div className="text-xl font-bold text-accent">{fmt(gokwikTotalOrders)}</div>
          <div className="text-[10px] text-text-muted">{gokwikDaily.length} days · {gokwikPrepaid > 0 ? `${((gokwikPrepaid / gokwikTotalOrders) * 100).toFixed(0)}% prepaid` : ''}</div>
        </div>
        <div className="prophet-card bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">OOS Alerts</div>
          <div className={`text-xl font-bold ${oosCount > 0 ? 'text-negative' : 'text-positive'}`}>{oosCount}</div>
          <div className="text-[10px] text-text-muted">{criticalCount} critical</div>
        </div>
        <div className="prophet-card bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">VWO Tests</div>
          <div className="text-xl font-bold text-positive">{vwoRunning} live</div>
          <div className="text-[10px] text-text-muted">{vwoWinners} winners</div>
        </div>
      </div>

      {/* Source cards — sorted so anything not "good" (error, then warning) floats to the top;
          healthy sources sink to the bottom since there's nothing to act on there. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" id="summary-source-cards">
        {sourceCards.map(c => <SummaryCard key={c.title} {...c} onNavigate={onNavigate} />)}
      </div>

      {/* Top Google Ads Campaigns quick view */}
      {topCampaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4" id="summary-top-campaigns">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">Top Google Ads Campaigns (Latest)</h2>
            <button onClick={() => onNavigate('google-ads')}
              className="text-[10px] font-medium px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              View All →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['Campaign', 'Type', 'Spend', 'Conv Value', 'ROAS'].map(h => (
                    <th key={h} className={`text-[10px] font-medium text-text-muted uppercase py-1.5 px-2 ${h === 'Campaign' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c, i) => {
                  const cost = pf(c.cost) || 0;
                  const convVal = pf(c.conv_value) || 0;
                  const roas = cost > 0 ? convVal / cost : 0;
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5 px-2 text-xs text-text-primary max-w-[220px] truncate">{c.campaign_name}</td>
                      <td className="py-1.5 px-2 text-right"><span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent">{c.campaign_type}</span></td>
                      <td className="py-1.5 px-2 text-xs text-right font-medium">{fmtCur(cost)}</td>
                      <td className="py-1.5 px-2 text-xs text-right">{fmtCur(convVal)}</td>
                      <td className="py-1.5 px-2 text-xs text-right">
                        <span className={roas >= 5 ? 'text-positive font-semibold' : roas >= 2 ? 'text-text-primary' : 'text-negative'}>{roas > 0 ? `${roas.toFixed(1)}x` : '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
