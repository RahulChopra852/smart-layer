import { useEffect, useState } from 'react';

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

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/40 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
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

export default function SummaryTab({ onNavigate }) {
  const { data, loading } = useFetchAll();

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
  const metaReports = data.metaReports?.reports || [];
  const metaSpend = metaReports.reduce((s, r) => s + (pf(r.amount_spent) || 0), 0);
  const metaPurchases = metaReports.reduce((s, r) => s + (pf(r.website_purchases) || 0), 0);
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

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-semibold text-text-primary mb-1">Dashboard Summary</h2>
        <p className="text-xs text-text-muted">
          Overview of all data sources · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">Google Ads Spend</div>
          <div className="text-xl font-bold text-negative">{fmtCur(adsTotalCost)}</div>
          <div className="text-[10px] text-text-muted">{adsDaily.length} days</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">Ads ROAS</div>
          <div className={`text-xl font-bold ${adsRoas >= 5 ? 'text-positive' : 'text-warning'}`}>{adsRoas.toFixed(1)}x</div>
          <div className="text-[10px] text-text-muted">Conv value: {fmtCur(adsTotalConvVal)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">GoKwik Orders</div>
          <div className="text-xl font-bold text-accent">{fmt(gokwikTotalOrders)}</div>
          <div className="text-[10px] text-text-muted">{gokwikDaily.length} days · {gokwikPrepaid > 0 ? `${((gokwikPrepaid / gokwikTotalOrders) * 100).toFixed(0)}% prepaid` : ''}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">OOS Alerts</div>
          <div className={`text-xl font-bold ${oosCount > 0 ? 'text-negative' : 'text-positive'}`}>{oosCount}</div>
          <div className="text-[10px] text-text-muted">{criticalCount} critical</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase">VWO Tests</div>
          <div className="text-xl font-bold text-positive">{vwoRunning} live</div>
          <div className="text-[10px] text-text-muted">{vwoWinners} winners</div>
        </div>
      </div>

      {/* Source cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SummaryCard
          title="Google Ads" tabId="google-ads" onNavigate={onNavigate}
          status={latestAds ? 'good' : 'error'}
          lastDate={latestAds?.date}
          metrics={[
            { label: 'Spend (latest)', value: fmtCur(pf(latestAds?.total_cost)), color: 'text-negative' },
            { label: 'ROAS', value: latestAds ? `${(pf(latestAds.roas) || 0).toFixed(1)}x` : '—', color: (pf(latestAds?.roas) || 0) >= 5 ? 'text-positive' : 'text-warning' },
            { label: 'Clicks', value: fmt(pf(latestAds?.total_clicks)) },
            { label: 'Conversions', value: fmt(Math.round(pf(latestAds?.total_conversions) || 0)) },
          ]}
        />

        <SummaryCard
          title="GoKwik Orders" tabId="gokwik" onNavigate={onNavigate}
          status={latestGokwik ? 'good' : 'error'}
          lastDate={latestGokwik?.date}
          metrics={[
            { label: 'Orders (latest)', value: fmt(pf(latestGokwik?.total_orders)), color: 'text-accent' },
            { label: 'Prepaid', value: fmt(pf(latestGokwik?.prepaid_orders)), color: 'text-positive' },
            { label: 'COD', value: fmt(pf(latestGokwik?.cod_orders)), color: 'text-warning' },
            { label: 'Top Coupon', value: latestGokwik?.top_coupon || '—' },
          ]}
        />

        <SummaryCard
          title="GA - App" tabId="ga-app" onNavigate={onNavigate}
          status={latestGaApp ? 'good' : 'warning'}
          lastDate={latestGaApp?.date}
          metrics={[
            { label: 'Total Sessions', value: fmt(gaAppSessions) },
            { label: 'Active Users', value: fmt(gaAppUsers) },
            { label: 'Latest Sessions', value: fmt(latestGaApp?.sessions) },
            { label: 'New Users', value: fmt(latestGaApp?.newUsers) },
          ]}
        />

        <SummaryCard
          title="Meta Ads" tabId="meta" onNavigate={onNavigate}
          status={metaReports.length ? 'good' : 'warning'}
          lastDate={latestMeta?.day || latestMeta?.reporting_start}
          metrics={[
            { label: 'Total Spend', value: fmtCur(metaSpend), color: 'text-negative' },
            { label: 'Purchases', value: fmt(metaPurchases), color: 'text-positive' },
            { label: 'Campaigns', value: fmt(new Set(metaReports.map(r => r.campaign_name)).size) },
            { label: 'Reports', value: fmt(metaReports.length) },
          ]}
        />

        <SummaryCard
          title="Web Vitals (PSI)" tabId="vitals" onNavigate={onNavigate}
          status={psiAlertCount > 0 ? 'warning' : psiEntries.length ? 'good' : 'error'}
          lastDate={latestPsi?.date}
          metrics={[
            { label: 'Pages Tracked', value: fmt(new Set(psiEntries.map(e => e.page)).size) },
            { label: 'Alert Entries', value: fmt(psiAlertCount), color: psiAlertCount > 0 ? 'text-warning' : 'text-positive' },
            { label: 'Latest Perf', value: latestPsi?.performance ? `${(pf(latestPsi.performance) * 100).toFixed(0) || latestPsi.performance}` : '—' },
            { label: 'Latest LCP', value: latestPsi?.lcp || '—' },
          ]}
        />

        <SummaryCard
          title="VWO AB Tests" tabId="vwo" onNavigate={onNavigate}
          status={vwoRunning > 0 ? 'good' : 'warning'}
          lastDate={vwoCampaigns[0]?.synced_at?.slice(0, 10)}
          metrics={[
            { label: 'Total Tests', value: fmt(vwoCampaigns.length) },
            { label: 'Running', value: fmt(vwoRunning), color: 'text-positive' },
            { label: 'Winners', value: fmt(vwoWinners), color: 'text-positive' },
            { label: 'Total Visitors', value: fmt(vwoCampaigns.reduce((s, c) => s + (pf(c.visitors) || 0), 0)) },
          ]}
        />

        <SummaryCard
          title="Products & OOS" tabId="products" onNavigate={onNavigate}
          status={oosCount > 0 ? 'error' : criticalCount > 0 ? 'warning' : 'good'}
          lastDate={new Date().toISOString().slice(0, 10)}
          metrics={[
            { label: 'OOS Items', value: fmt(oosCount), color: oosCount > 0 ? 'text-negative' : 'text-positive' },
            { label: 'Critical (<10)', value: fmt(criticalCount), color: criticalCount > 0 ? 'text-warning' : 'text-positive' },
            { label: 'Low Stock Total', value: fmt(oosAlerts.length) },
            { label: 'Status', value: oosCount === 0 ? 'All Good' : `${oosCount} need restock`, color: oosCount === 0 ? 'text-positive' : 'text-negative' },
          ]}
        />

        <SummaryCard
          title="Anomalies" tabId="anomalies" onNavigate={onNavigate}
          status={anomalies.length > 3 ? 'warning' : 'good'}
          lastDate={anomalies[0]?.date}
          metrics={[
            { label: 'Total Flagged', value: fmt(anomalies.length), color: anomalies.length > 5 ? 'text-warning' : 'text-text-primary' },
            { label: 'Latest', value: anomalies[0]?.date || '—' },
            { label: 'CRO Tab', value: 'View funnel →' },
            { label: 'GA Web', value: 'View traffic →' },
          ]}
        />
      </div>

      {/* Top Google Ads Campaigns quick view */}
      {topCampaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
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
