import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const GOOGLE_ADS_SECTIONS = [
  { id: 'google-ads-header', label: 'Overview' },
  { id: 'google-ads-channel', label: 'Spend by Channel' },
  { id: 'google-ads-campaigns', label: 'Top Campaigns' },
  { id: 'google-ads-daily', label: 'Daily Performance' },
];

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const fmt = (v) => v == null ? '—' : v.toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;

function StatCard({ label, value, sub, color = 'text-text-primary' }) {
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50">
      <div className="text-[10px] text-text-muted uppercase">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function TypeBreakdown({ daily }) {
  if (!daily.length) return null;

  const types = [
    { label: 'PMax', costKey: 'pmax_cost', valKey: 'pmax_conv_value', roasKey: 'pmax_roas', color: 'bg-accent' },
    { label: 'Search', costKey: 'search_cost', valKey: 'search_conv_value', roasKey: 'search_roas', color: 'bg-positive' },
    { label: 'App', costKey: 'app_cost', valKey: null, convKey: 'app_conversions', color: 'bg-warning' },
    { label: 'Demand Gen', costKey: 'demandgen_cost', valKey: 'demandgen_conv_value', color: 'bg-purple-400' },
    { label: 'Video', costKey: 'video_cost', valKey: null, imprKey: 'video_impressions', color: 'bg-blue-400' },
  ];

  const totals = {};
  types.forEach(t => {
    totals[t.label] = { cost: 0, value: 0, conv: 0, impr: 0 };
    daily.forEach(row => {
      totals[t.label].cost += pf(row[t.costKey]) || 0;
      if (t.valKey) totals[t.label].value += pf(row[t.valKey]) || 0;
      if (t.convKey) totals[t.label].conv += pf(row[t.convKey]) || 0;
      if (t.imprKey) totals[t.label].impr += pf(row[t.imprKey]) || 0;
    });
  });

  const totalCost = Object.values(totals).reduce((s, t) => s + t.cost, 0) || 1;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Spend by Channel</h2>
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {types.map(t => {
          const pct = (totals[t.label].cost / totalCost) * 100;
          if (pct < 1) return null;
          return <div key={t.label} className={`${t.color} transition-all`} style={{ width: `${pct}%` }} title={`${t.label}: ${pct.toFixed(0)}%`} />;
        })}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {types.map(t => {
          const d = totals[t.label];
          const roas = d.cost > 0 && d.value > 0 ? (d.value / d.cost).toFixed(1) : null;
          return (
            <div key={t.label} className="bg-bg rounded-md p-2.5 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full ${t.color}`} />
                <span className="text-[10px] text-text-muted uppercase">{t.label}</span>
              </div>
              <div className="text-sm font-semibold text-text-primary">{fmtCur(d.cost)}</div>
              <div className="text-[10px] text-text-muted">
                {roas ? `ROAS: ${roas}x` : d.conv > 0 ? `${fmt(d.conv)} conv` : d.impr > 0 ? `${fmt(d.impr)} impr` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyTable({ daily }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Daily Performance</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Date', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Conv Value', 'ROAS'].map(h => (
                <th key={h} className={`text-[11px] font-medium text-text-muted uppercase py-2 px-3 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((row, i) => {
              const cost = pf(row.total_cost) || 0;
              const prev = daily[i + 1];
              const prevCost = prev ? (pf(prev.total_cost) || 0) : null;
              const delta = prevCost != null && prevCost > 0 ? (((cost - prevCost) / prevCost) * 100).toFixed(1) : null;
              const roas = pf(row.roas) || 0;

              return (
                <tr key={row.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2.5 px-3 text-sm font-medium text-text-primary">{row.date}</td>
                  <td className="py-2.5 px-3 text-sm text-right font-semibold text-text-primary">
                    {fmtCur(cost)}
                    {delta != null && (
                      <span className={`ml-1 text-[10px] ${parseFloat(delta) <= 0 ? 'text-positive' : 'text-negative'}`}>
                        {parseFloat(delta) >= 0 ? '+' : ''}{delta}%
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(pf(row.total_impressions))}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(pf(row.total_clicks))}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(Math.round(pf(row.total_conversions) || 0))}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-primary">{fmtCur(pf(row.total_conv_value))}</td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    <span className={roas >= 5 ? 'text-positive font-semibold' : roas >= 2 ? 'text-text-primary' : 'text-negative'}>
                      {roas > 0 ? `${roas.toFixed(1)}x` : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignsTable({ selectedDate }) {
  const { data, loading } = useApi('/api/analytics/google-ads-campaigns');
  const campaigns = data?.campaigns || [];

  const filtered = useMemo(() => {
    const rows = selectedDate ? campaigns.filter(c => c.date === selectedDate) : campaigns;
    if (!selectedDate) {
      const agg = {};
      rows.forEach(c => {
        if (!agg[c.campaign_name]) {
          agg[c.campaign_name] = { ...c, cost: 0, impressions: 0, clicks: 0, conversions: 0, conv_value: 0, days: 0 };
        }
        agg[c.campaign_name].cost += pf(c.cost) || 0;
        agg[c.campaign_name].impressions += pf(c.impressions) || 0;
        agg[c.campaign_name].clicks += pf(c.clicks) || 0;
        agg[c.campaign_name].conversions += pf(c.conversions) || 0;
        agg[c.campaign_name].conv_value += pf(c.conv_value) || 0;
        agg[c.campaign_name].days++;
      });
      return Object.values(agg).sort((a, b) => b.cost - a.cost).slice(0, 20);
    }
    return rows.slice(0, 20);
  }, [campaigns, selectedDate]);

  if (loading || !filtered.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Top Campaigns by Spend</h2>
        <span className="text-[10px] text-text-muted">{selectedDate || 'All dates'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Campaign', 'Type', 'Spend', 'Clicks', 'Conv', 'Conv Value', 'ROAS'].map(h => (
                <th key={h} className={`text-[11px] font-medium text-text-muted uppercase py-2 px-3 ${h === 'Campaign' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const cost = typeof c.cost === 'number' ? c.cost : pf(c.cost) || 0;
              const convVal = typeof c.conv_value === 'number' ? c.conv_value : pf(c.conv_value) || 0;
              const roas = cost > 0 ? convVal / cost : 0;
              const name = c.campaign_name || c.name || '';
              const type = c.campaign_type || c.type || '';

              return (
                <tr key={name + i} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2 px-3 text-sm text-text-primary max-w-[280px] truncate" title={name}>{name}</td>
                  <td className="py-2 px-3 text-right">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">{type}</span>
                  </td>
                  <td className="py-2 px-3 text-sm text-right font-semibold text-text-primary">{fmtCur(cost)}</td>
                  <td className="py-2 px-3 text-sm text-right text-text-secondary">{fmt(typeof c.clicks === 'number' ? c.clicks : pf(c.clicks))}</td>
                  <td className="py-2 px-3 text-sm text-right text-text-secondary">{fmt(Math.round(typeof c.conversions === 'number' ? c.conversions : pf(c.conversions) || 0))}</td>
                  <td className="py-2 px-3 text-sm text-right text-text-primary">{fmtCur(convVal)}</td>
                  <td className="py-2 px-3 text-sm text-right">
                    <span className={roas >= 5 ? 'text-positive font-semibold' : roas >= 2 ? 'text-text-primary' : roas > 0 ? 'text-negative' : 'text-text-muted'}>
                      {roas > 0 ? `${roas.toFixed(1)}x` : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GoogleAdsTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useApi(`/api/analytics/google-ads-daily?_k=${refreshKey}`);
  const daily = data?.daily || [];

  const dates = daily.map(r => r.date);
  const [selectedDate, setSelectedDate] = useState(null);

  const totals = useMemo(() => {
    let cost = 0, impr = 0, clicks = 0, conv = 0, convVal = 0;
    daily.forEach(r => {
      cost += pf(r.total_cost) || 0;
      impr += pf(r.total_impressions) || 0;
      clicks += pf(r.total_clicks) || 0;
      conv += pf(r.total_conversions) || 0;
      convVal += pf(r.total_conv_value) || 0;
    });
    return { cost, impr, clicks, conv, convVal, roas: cost > 0 ? convVal / cost : 0, days: daily.length };
  }, [daily]);

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={GOOGLE_ADS_SECTIONS} />
      {/* Header + Stats */}
      <div className="bg-card border border-border rounded-lg p-4" id="google-ads-header">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Google Ads</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {daily.length ? `${daily.length} days · ${daily[daily.length - 1]?.date} to ${daily[0]?.date}` : 'No data synced yet — set up the Apps Script'}
            </p>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition-opacity">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-negative text-center py-8">{error}</p>
        ) : daily.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted mb-1">No Google Ads data yet</p>
            <p className="text-xs text-text-muted">Deploy the Apps Script to start syncing from Drive / Gmail</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
              <StatCard label="Total Spend" value={fmtCur(totals.cost)} sub={`${totals.days} days`} color="text-negative" />
              <StatCard label="Conv Value" value={fmtCur(totals.convVal)} color="text-positive" />
              <StatCard label="ROAS" value={`${totals.roas.toFixed(1)}x`} color={totals.roas >= 5 ? 'text-positive' : 'text-warning'} />
              <StatCard label="Conversions" value={fmt(Math.round(totals.conv))} color="text-text-primary" />
              <StatCard label="Clicks" value={fmt(totals.clicks)} color="text-text-primary" />
              <StatCard label="Impressions" value={fmt(totals.impr)} color="text-text-primary" />
            </div>

            {/* Date filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedDate(null)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  !selectedDate ? 'bg-accent text-white' : 'bg-bg text-text-muted hover:text-text-secondary border border-border'
                }`}>All</button>
              {dates.slice(0, 10).map(d => (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                    selectedDate === d ? 'bg-accent text-white' : 'bg-bg text-text-muted hover:text-text-secondary border border-border'
                  }`}>{d.slice(5)}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Channel breakdown */}
      {daily.length > 0 && <div id="google-ads-channel"><TypeBreakdown daily={selectedDate ? daily.filter(d => d.date === selectedDate) : daily} /></div>}

      {/* Top campaigns */}
      {daily.length > 0 && <div id="google-ads-campaigns"><CampaignsTable selectedDate={selectedDate} /></div>}

      {/* Daily table */}
      {daily.length > 0 && <div id="google-ads-daily"><DailyTable daily={daily} /></div>}
    </div>
  );
}
