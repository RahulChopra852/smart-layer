import { useState, useCallback, useMemo, Fragment } from 'react';
import { useApi } from '../hooks/useApi';

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const x100 = (v) => { const n = pf(v); return n != null ? n * 100 : null; };
function fmt(n) { if (n == null || isNaN(n)) return '—'; return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function inr(n) { if (n == null || isNaN(n)) return '—'; return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function pctD(n) { if (n == null || isNaN(n)) return '—'; return `${n.toFixed(2)}%`; }


function UploadForm({ onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  async function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true); setResult(null);
    try {
      const form = new FormData(); form.append('file', file);
      const res = await fetch('/api/meta/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ ok: true, msg: `${data.campaignRowCount} campaigns uploaded` });
      onUploaded?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setUploading(false); e.target.value = ''; }
  }
  return (
    <div className="flex items-center gap-3">
      <label className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-opacity ${uploading ? 'bg-border text-text-muted' : 'bg-accent text-white hover:opacity-90'}`}>
        {uploading ? 'Uploading...' : 'Upload CSV'}
        <input type="file" accept=".csv" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {result && <span className={`text-xs ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50">
      <div className="text-[10px] text-text-muted uppercase mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-text-primary'}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function InsightCard({ title, emoji, items, color }) {
  if (!items.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">{emoji} {title}</h3>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="bg-bg rounded-md p-3 border border-border/50">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-medium text-text-primary leading-relaxed" title={item.name}>{item.name}</div>
              <div className={`text-sm font-bold ${color} whitespace-nowrap shrink-0`}>{item.value}</div>
            </div>
            <div className="text-[11px] text-text-muted mt-1">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateInsights(campaigns) {
  const c = campaigns.map(r => ({
    name: r.ad_name || r.campaign_name,
    campaign: r.campaign_name,
    spend: pf(r.amount_spent) || 0,
    purchases: pf(r.website_purchases) || 0,
    roas: pf(r.roas),
    cpp: pf(r.cost_per_purchase),
    aov: pf(r.aov),
    lcToLpv: x100(r.lc_to_lpv),
    lpvToA2c: x100(r.lpv_to_a2c),
    a2cToCi: x100(r.a2c_to_ci),
    ciToOrder: x100(r.ci_to_order),
    hookRate: pf(r.hook_rate),
    lpv: pf(r.lpv) || 0,
  })).filter(r => r.spend > 50);

  const tag = (r) => r.campaign !== r.name ? r.campaign.slice(0, 40) : '';

  const winners = c.filter(r => r.roas >= 3 && r.purchases >= 3)
    .sort((a, b) => b.roas - a.roas).slice(0, 7)
    .map(r => ({ name: r.name, value: `${fmt(r.roas)}x ROAS`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${inr(r.spend)} · ${r.purchases} purchases · ${inr(r.aov)} AOV` }));

  const losers = c.filter(r => r.roas != null && r.roas < 1.5 && r.spend > 300)
    .sort((a, b) => a.roas - b.roas).slice(0, 7)
    .map(r => ({ name: r.name, value: `${fmt(r.roas)}x ROAS`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${inr(r.spend)} · ${r.purchases} purchases · CPP ${inr(r.cpp)}` }));

  const lowLcToLpv = c.filter(r => r.lcToLpv != null && r.lcToLpv < 60 && r.spend > 200)
    .sort((a, b) => a.lcToLpv - b.lcToLpv).slice(0, 7)
    .map(r => ({ name: r.name, value: `${pctD(r.lcToLpv)} LC→LPV`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${inr(r.spend)} — clicks not reaching LP` }));

  const funnelLeaks = c.filter(r => r.lpvToA2c != null && r.lpvToA2c < 15 && r.lpv > 50)
    .sort((a, b) => a.lpvToA2c - b.lpvToA2c).slice(0, 7)
    .map(r => ({ name: r.name, value: `${pctD(r.lpvToA2c)} LPV→A2C`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${fmt(r.lpv)} LPVs — PDP/offer issue` }));

  const highCpp = c.filter(r => r.cpp != null && r.cpp > 800 && r.purchases >= 1)
    .sort((a, b) => b.cpp - a.cpp).slice(0, 7)
    .map(r => ({ name: r.name, value: `${inr(r.cpp)} CPP`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${inr(r.spend)} for ${r.purchases} purchases` }));

  const scalable = c.filter(r => r.roas >= 2.5 && r.spend < 5000 && r.purchases >= 1)
    .sort((a, b) => b.roas - a.roas).slice(0, 7)
    .map(r => ({ name: r.name, value: `${fmt(r.roas)}x on ${inr(r.spend)}`, detail: `${tag(r) ? tag(r) + ' · ' : ''}scale budget candidate` }));

  const lowHook = c.filter(r => r.hookRate != null && r.hookRate < 15 && r.spend > 500)
    .sort((a, b) => a.hookRate - b.hookRate).slice(0, 7)
    .map(r => ({ name: r.name, value: `${pctD(r.hookRate)} hook`, detail: `${tag(r) ? tag(r) + ' · ' : ''}${inr(r.spend)} — creative not grabbing attention` }));

  return { winners, losers, lowLcToLpv, funnelLeaks, highCpp, scalable, lowHook };
}

function DailyAdAnalysis({ dayData, availableDays }) {
  const allAds = new Map();
  for (const day of availableDays) {
    for (const c of dayData[day]?.campaigns || []) {
      const adName = c.ad_name || c.campaign_name;
      const key = `${c.campaign_name}|||${adName}`;
      if (!allAds.has(key)) allAds.set(key, { name: adName, campaign: c.campaign_name, days: {} });
      allAds.get(key).days[day] = c;
    }
  }

  const ads = [...allAds.values()].map(ad => {
    const totalSpend = availableDays.reduce((s, d) => s + (pf(ad.days[d]?.amount_spent) || 0), 0);
    const totalPurchases = availableDays.reduce((s, d) => s + (pf(ad.days[d]?.website_purchases) || 0), 0);
    const totalRevenue = availableDays.reduce((s, d) => {
      const dc = ad.days[d];
      return s + ((pf(dc?.website_purchases) || 0) * (pf(dc?.aov) || 0));
    }, 0);
    const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;
    const totalCpp = totalPurchases > 0 ? totalSpend / totalPurchases : null;
    return { ...ad, totalSpend, totalPurchases, totalRoas, totalCpp };
  }).sort((a, b) => b.totalSpend - a.totalSpend);

  const [metric, setMetric] = useState('amount_spent');
  const metricOpts = [
    { key: 'amount_spent', label: 'Spend', f: inr },
    { key: 'website_purchases', label: 'Purchases', f: fmt },
    { key: 'roas', label: 'ROAS', f: v => `${fmt(v)}x` },
    { key: 'cost_per_purchase', label: 'CPP', f: inr },
    { key: 'ctr_all', label: 'CTR', f: pctD },
    { key: 'hook_rate', label: 'Hook Rate', f: pctD },
  ];
  const activeMeta = metricOpts.find(m => m.key === metric);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Ad Analysis — Daily Breakdown</h2>
          <p className="text-xs text-text-muted mt-0.5">Per-ad performance across {availableDays.length} days with totals</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {metricOpts.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                metric === m.key ? 'bg-accent text-white border-accent' : 'bg-bg text-text-secondary border-border hover:border-accent/50'
              }`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 sticky left-0 bg-card z-10 min-w-[200px]">Ad / Campaign</th>
              {availableDays.map(d => (
                <th key={d} className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 whitespace-nowrap">{d.slice(5)}</th>
              ))}
              <th className="text-right text-[10px] font-semibold text-accent uppercase tracking-wider py-2 px-2 whitespace-nowrap border-l border-border">Total</th>
            </tr>
          </thead>
          <tbody>
            {ads.map(ad => {
              const totalVal = metric === 'amount_spent' ? ad.totalSpend
                : metric === 'website_purchases' ? ad.totalPurchases
                : metric === 'roas' ? ad.totalRoas
                : metric === 'cost_per_purchase' ? ad.totalCpp
                : null;

              return (
                <tr key={ad.name} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2.5 px-2 text-xs text-text-primary max-w-[240px] truncate sticky left-0 bg-card z-10" title={`${ad.name}\n${ad.campaign}`}>
                    <div className="truncate font-medium">{ad.name}</div>
                    {ad.campaign !== ad.name && <div className="truncate text-[10px] text-text-muted">{ad.campaign}</div>}
                  </td>
                  {availableDays.map(d => {
                    const dc = ad.days[d];
                    const val = dc ? pf(dc[metric]) : null;
                    return (
                      <td key={d} className={`py-2.5 px-2 text-xs text-right ${val == null ? 'text-text-muted' : 'text-text-secondary'}`}>
                        {val != null ? activeMeta.f(val) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-2 text-xs text-right font-semibold text-text-primary border-l border-border">
                    {totalVal != null ? activeMeta.f(totalVal) : '—'}
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

function AdRow({ c, isAd }) {
  const roas = pf(c.roas);
  const cpp = pf(c.cost_per_purchase);
  const name = isAd ? (c.ad_name || '(no ad name)') : c.campaign_name;
  return (
    <tr className={`border-b border-border/50 hover:bg-bg transition-colors ${!isAd ? 'bg-bg/50' : ''}`}>
      <td className={`py-2.5 px-2 text-xs max-w-[240px] truncate ${isAd ? 'pl-6 text-text-secondary' : 'font-medium text-text-primary'}`} title={name}>
        {isAd && <span className="text-text-muted mr-1">↳</span>}{name}
      </td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{inr(pf(c.amount_spent))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(pf(c.ctr_all))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{inr(pf(c.cpm))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{inr(pf(c.cpc))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(pf(c.ctr_link))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{inr(pf(c.cost_per_lpv))}</td>
      <td className={`py-2.5 px-2 text-xs text-right font-medium ${cpp > 1000 ? 'text-negative' : 'text-text-secondary'}`}>{inr(cpp)}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{inr(pf(c.aov))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.lc_to_lpv))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.lpv_to_a2c))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.a2c_to_ci))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.a2c_to_order))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.ci_to_order))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{fmt(pf(c.website_checkouts))}</td>
      <td className="py-2.5 px-2 text-xs text-right font-medium text-text-primary">{fmt(pf(c.website_purchases))}</td>
      <td className={`py-2.5 px-2 text-xs text-right font-semibold ${roas >= 3 ? 'text-positive' : roas != null && roas < 1.5 ? 'text-negative' : 'text-text-secondary'}`}>{fmt(roas)}x</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.cvr_pct))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{fmt(pf(c.lpv))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{fmt(pf(c.link_clicks))}</td>
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(pf(c.hook_rate))}</td>
    </tr>
  );
}

function CampaignTable({ campaigns }) {
  // Group ads by campaign
  const byCampaign = {};
  for (const c of campaigns) {
    const key = c.campaign_name;
    if (!byCampaign[key]) byCampaign[key] = { name: key, ads: [], totalSpend: 0 };
    byCampaign[key].ads.push(c);
    byCampaign[key].totalSpend += pf(c.amount_spent) || 0;
  }
  const groups = Object.values(byCampaign).sort((a, b) => b.totalSpend - a.totalSpend);

  const [expanded, setExpanded] = useState({});
  const toggle = (name) => setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  const cols = [
    { h: 'Campaign / Ad', align: 'left' },
    { h: 'Spend' }, { h: 'CTR' }, { h: 'CPM' }, { h: 'CPC' }, { h: 'CTR Link' },
    { h: 'Cost/LPV' }, { h: 'CPP' }, { h: 'AOV' },
    { h: 'LC→LPV' }, { h: 'LPV→A2C' }, { h: 'A2C→CI' }, { h: 'A2C→Ord' }, { h: 'CI→Ord' },
    { h: 'Checkouts' }, { h: 'Purchases' }, { h: 'ROAS' }, { h: 'CVR' },
    { h: 'LPVs' }, { h: 'Clicks' }, { h: 'Hook Rate' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="sticky top-0 z-[2] bg-card">
          <tr className="border-b border-border">
            {cols.map(c => (
              <th key={c.h} className={`text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 whitespace-nowrap ${c.align === 'left' ? 'text-left' : 'text-right'}`}>{c.h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const hasAds = g.ads.some(a => a.ad_name);
            const isOpen = expanded[g.name];
            const sortedAds = [...g.ads].sort((a, b) => (pf(b.amount_spent) || 0) - (pf(a.amount_spent) || 0));
            // Campaign summary row (use first ad's data if only one, otherwise show campaign name)
            const summaryRow = g.ads.length === 1 && !hasAds ? g.ads[0] : null;

            if (summaryRow) {
              return <AdRow key={g.name} c={summaryRow} isAd={false} />;
            }

            return (
              <Fragment key={g.name}>
                <tr className="border-b border-border/50 bg-bg/50 cursor-pointer hover:bg-bg" onClick={() => toggle(g.name)}>
                  <td className="py-2.5 px-2 text-xs font-medium text-text-primary max-w-[240px] truncate" title={g.name}>
                    <span className="text-text-muted mr-1">{isOpen ? '▼' : '▶'}</span>
                    {g.name}
                    <span className="text-[10px] text-text-muted ml-1">({g.ads.length} ads)</span>
                  </td>
                  <td className="py-2.5 px-2 text-xs text-right font-medium text-text-primary">{inr(g.totalSpend)}</td>
                  <td colSpan={19} />
                </tr>
                {isOpen && sortedAds.map((ad, j) => (
                  <AdRow key={`${g.name}-${j}`} c={ad} isAd={true} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewAdsLaunched({ dayData, availableDays }) {
  const [expandedDays, setExpandedDays] = useState({});
  const toggle = (day) => setExpandedDays(prev => ({ ...prev, [day]: !prev[day] }));

  const adFirstSeen = new Map();
  for (const day of availableDays) {
    for (const c of dayData[day]?.campaigns || []) {
      const adName = c.ad_name || c.campaign_name;
      const key = `${c.campaign_name}|||${adName}`;
      if (!adFirstSeen.has(key)) {
        adFirstSeen.set(key, {
          ad: adName, campaign: c.campaign_name, launchDay: day,
          spend: pf(c.amount_spent) || 0, purchases: pf(c.website_purchases) || 0,
          roas: pf(c.roas), cpp: pf(c.cost_per_purchase), aov: pf(c.aov),
          hookRate: pf(c.hook_rate), ctr: pf(c.ctr_all),
        });
      }
    }
  }
  const byDay = {};
  for (const [, info] of adFirstSeen) {
    if (!byDay[info.launchDay]) byDay[info.launchDay] = [];
    byDay[info.launchDay].push(info);
  }
  const days = Object.keys(byDay).sort().reverse();

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">New Ads Launched</h2>
          <p className="text-xs text-text-muted mt-0.5">Click a date to expand campaign details</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-positive/15 text-positive">
          {adFirstSeen.size} total ads
        </span>
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[3] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Launch Date</th>
              <th className="text-left text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Ad / Campaign</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Spend</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Purchases</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">ROAS</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">CPP</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">AOV</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">CTR</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Hook</th>
            </tr>
          </thead>
          <tbody>
            {days.flatMap(day => {
              const dayAds = byDay[day].sort((a, b) => b.spend - a.spend);
              const campaigns = new Set(dayAds.map(a => a.campaign));
              const totalSpend = dayAds.reduce((s, a) => s + a.spend, 0);
              const totalPurchases = dayAds.reduce((s, a) => s + a.purchases, 0);
              const isOpen = expandedDays[day];
              return [
                <tr key={`${day}-summary`} className="bg-accent/5 border-b border-accent/20 cursor-pointer hover:bg-accent/10 transition-colors" onClick={() => toggle(day)}>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted text-sm">{isOpen ? '▼' : '▶'}</span>
                      <span className="text-xs font-bold text-white bg-accent px-2.5 py-1 rounded-md inline-block">{day}</span>
                    </div>
                  </td>
                  <td colSpan={8} className="py-2.5 px-2">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-accent">{campaigns.size} campaigns</span>
                      <span className="text-[10px] text-text-muted">|</span>
                      <span className="text-xs font-medium text-text-primary">{dayAds.length} ads</span>
                      <span className="text-[10px] text-text-muted">|</span>
                      <span className="text-xs text-text-secondary">Spend: <span className="font-semibold text-text-primary">{inr(totalSpend)}</span></span>
                      <span className="text-[10px] text-text-muted">|</span>
                      <span className="text-xs text-text-secondary">Purchases: <span className="font-semibold text-text-primary">{fmt(totalPurchases)}</span></span>
                    </div>
                  </td>
                </tr>,
                ...(isOpen ? dayAds.map((ad, i) => (
                  <tr key={`${day}-${i}`} className="border-b border-border/30 hover:bg-bg transition-colors">
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className="text-[10px] text-text-muted pl-5">{day.slice(5)}</span>
                    </td>
                    <td className="py-2 px-2 max-w-[280px]">
                      <div className="text-xs text-text-primary truncate" title={ad.ad}>{ad.ad}</div>
                      <div className="text-[10px] text-text-muted truncate" title={ad.campaign}>{ad.campaign}</div>
                    </td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{inr(ad.spend)}</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-text-primary">{fmt(ad.purchases)}</td>
                    <td className={`py-2 px-2 text-xs text-right font-semibold ${ad.roas != null && ad.roas >= 3 ? 'text-positive' : ad.roas != null && ad.roas < 1.5 ? 'text-negative' : 'text-text-secondary'}`}>
                      {ad.roas != null ? `${fmt(ad.roas)}x` : '—'}
                    </td>
                    <td className={`py-2 px-2 text-xs text-right ${ad.cpp != null && ad.cpp > 1000 ? 'text-negative' : 'text-text-secondary'}`}>{ad.cpp != null ? inr(ad.cpp) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{ad.aov != null ? inr(ad.aov) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{ad.ctr != null ? pctD(ad.ctr) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{ad.hookRate != null ? pctD(ad.hookRate) : '—'}</td>
                  </tr>
                )) : [])
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MetaTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useApi(`/api/analytics/meta-reports?_k=${refreshKey}`);
  const handleUploaded = useCallback(() => setRefreshKey(k => k + 1), []);
  const reports = data?.reports || [];

  const { accountTotal, dayData, availableDays, insights } = useMemo(() => {
    const totals = reports.filter(r => !r.campaign_name);
    const accountTotal = totals[0] || null;

    const dayData = {};
    for (const r of reports) {
      if (!r.campaign_name) continue;
      const day = r.day;
      if (!day) continue;
      if (!dayData[day]) dayData[day] = { campaigns: [], total: null };
      dayData[day].campaigns.push(r);
    }

    // Aggregate totals per day from campaign data
    for (const [day, dd] of Object.entries(dayData)) {
      const camps = dd.campaigns;
      dd.total = {
        amount_spent: camps.reduce((s, c) => s + (pf(c.amount_spent) || 0), 0),
        website_purchases: camps.reduce((s, c) => s + (pf(c.website_purchases) || 0), 0),
        website_checkouts: camps.reduce((s, c) => s + (pf(c.website_checkouts) || 0), 0),
        lpv: camps.reduce((s, c) => s + (pf(c.lpv) || 0), 0),
        link_clicks: camps.reduce((s, c) => s + (pf(c.link_clicks) || 0), 0),
      };
      const t = dd.total;
      const totalRevenue = camps.reduce((s, c) => s + (pf(c.website_purchases) || 0) * (pf(c.aov) || 0), 0);
      t.roas = t.amount_spent > 0 ? totalRevenue / t.amount_spent : null;
      t.aov = t.website_purchases > 0 ? totalRevenue / t.website_purchases : null;
      t.cost_per_purchase = t.website_purchases > 0 ? t.amount_spent / t.website_purchases : null;
      t.cvr_pct = t.link_clicks > 0 ? t.website_purchases / t.link_clicks : null;
      t.cpm = camps.reduce((s, c) => s + (pf(c.cpm) || 0) * (pf(c.amount_spent) || 0), 0) / (t.amount_spent || 1);
      t.lc_to_lpv = t.link_clicks > 0 ? t.lpv / t.link_clicks : null;
      t.lpv_to_a2c = accountTotal ? pf(accountTotal.lpv_to_a2c) : null;
      t.a2c_to_ci = accountTotal ? pf(accountTotal.a2c_to_ci) : null;
      t.ci_to_order = accountTotal ? pf(accountTotal.ci_to_order) : null;
      t.hook_rate = accountTotal ? pf(accountTotal.hook_rate) : null;
    }

    const availableDays = Object.keys(dayData).sort();

    // Use latest day's campaigns for insights
    const latestDay = availableDays[availableDays.length - 1];
    const insights = latestDay ? generateInsights(dayData[latestDay].campaigns) : null;

    return { accountTotal, dayData, availableDays, insights };
  }, [reports]);

  const [selectedDay, setSelectedDay] = useState(null);

  const activeDay = selectedDay || availableDays[availableDays.length - 1];

  const activeDayData = dayData[activeDay];

  return (
    <div className="flex flex-col gap-4">
      {/* Header + KPIs */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Meta Ads Analysis</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {accountTotal ? `${accountTotal.reporting_start} to ${accountTotal.reporting_end}` : 'Upload daily Meta CSV exports'}
            </p>
          </div>
          <UploadForm onUploaded={handleUploaded} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-text-muted mb-2">No Meta reports uploaded yet</p>
            <p className="text-xs text-text-muted">Upload a GNC Daily Funnel Report CSV to get started</p>
          </div>
        ) : accountTotal ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCard label="Total Spend" value={inr(pf(accountTotal.amount_spent))} />
              <KpiCard label="Purchases" value={fmt(pf(accountTotal.website_purchases))} />
              <KpiCard label="ROAS" value={`${fmt(pf(accountTotal.roas))}x`} color={pf(accountTotal.roas) >= 2.5 ? 'text-positive' : 'text-negative'} />
              <KpiCard label="AOV" value={inr(pf(accountTotal.aov))} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <KpiCard label="LC → LPV" value={pctD(x100(accountTotal.lc_to_lpv))} sub={`${fmt(pf(accountTotal.lpv))} LPVs`} />
              <KpiCard label="LPV → A2C" value={pctD(x100(accountTotal.lpv_to_a2c))} />
              <KpiCard label="A2C → CI" value={pctD(x100(accountTotal.a2c_to_ci))} />
              <KpiCard label="CI → Order" value={pctD(x100(accountTotal.ci_to_order))} />
              <KpiCard label="CVR" value={pctD(x100(accountTotal.cvr_pct))} />
              <KpiCard label="Hook Rate" value={pctD(pf(accountTotal.hook_rate))} />
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted">{availableDays.length} days of data loaded</p>
        )}
      </div>

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InsightCard title="Top Winners" emoji="🏆" items={insights.winners} color="text-positive" />
          <InsightCard title="Underperformers" emoji="🔻" items={insights.losers} color="text-negative" />
          <InsightCard title="Low LC → LPV (<60%)" emoji="🔗" items={insights.lowLcToLpv} color="text-warning" />
          <InsightCard title="Funnel Leaks (LPV→A2C <15%)" emoji="🚰" items={insights.funnelLeaks} color="text-warning" />
          <InsightCard title="High CPP (>₹1K)" emoji="💸" items={insights.highCpp} color="text-negative" />
          <InsightCard title="Ready to Scale" emoji="🚀" items={insights.scalable} color="text-accent" />
          <InsightCard title="Low Hook Rate (<20%)" emoji="🎣" items={insights.lowHook} color="text-warning" />
        </div>
      )}

      {/* New Ads Launched — by date */}
      {availableDays.length >= 1 && (
        <NewAdsLaunched dayData={dayData} availableDays={availableDays} />
      )}

      {/* Campaign table for selected day */}
      {activeDayData?.campaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">All Campaigns — {activeDay}</h2>
              <p className="text-xs text-text-muted mt-0.5">Sorted by spend</p>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {activeDayData.campaigns.length} campaigns
            </span>
          </div>
          <CampaignTable campaigns={activeDayData.campaigns} />
        </div>
      )}
    </div>
  );
}
