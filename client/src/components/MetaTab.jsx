import { useState, useCallback, useMemo, Fragment } from 'react';
import { useApi } from '../hooks/useApi';

// Must match TOTAL_MARKER in server/services/metaParser.js — Meta's CSV "Totals" row is
// stored with this sentinel instead of a blank campaign_name/ad_name (which the DB rejects).
const TOTAL_MARKER = '(account total)';

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

const LEVEL_OPTIONS = [
  { key: 'campaign', label: 'Campaign', icon: '📢' },
  { key: 'adset', label: 'Ad Set', icon: '🗂️' },
  { key: 'ad', label: 'Ad', icon: '🎯' },
];
const levelLabelOf = (level) => LEVEL_OPTIONS.find(o => o.key === level)?.label || level;

// Segmented control (single active pill, no per-option border) for switching the Campaign /
// Ad Set / Ad analysis granularity — visually distinct from the plain bordered-button toggles
// used elsewhere (day/week range) so the two kinds of choice don't blend together.
function LevelSwitch({ value, onChange, label = 'Analyzing' }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs font-medium text-text-secondary">{label}:</span>}
      <div className="inline-flex items-center bg-bg border border-border rounded-lg p-0.5 gap-0.5">
        {LEVEL_OPTIONS.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              value === o.key ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}>
            <span>{o.icon}</span>{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Every ranked row shares the same subheading — spend, purchases, CTR, CAC — so the only
// thing that changes between cards is which metric decides the ranking (item.value).
function InsightCard({ title, emoji, items, color, levelTag }) {
  if (!items.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-text-primary mb-3 shrink-0 flex items-center gap-2">
        <span>{emoji} {title}</span>
        {levelTag && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{levelTag}</span>}
      </h3>
      <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="bg-bg rounded-md p-3 border border-border/50">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-medium text-text-primary leading-relaxed">
                {item.name}
                {item.tag && <div className="text-[10px] font-normal text-text-muted truncate">{item.tag}</div>}
              </div>
              <div className={`text-sm font-bold ${color} whitespace-nowrap shrink-0`}>{item.value}</div>
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              <span className="font-semibold text-text-primary">{inr(item.spend)}</span>
              {' · '}
              <span className="font-semibold text-text-primary">{fmt(item.purchases)} purchases</span>
              {' · '}{pctD(item.ctr)} CTR · {inr(item.cac)} CAC
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Spend-weighted average of a per-day ratio — used for week-level rollups of metrics we can't
// recompute from counts (Meta gives us only the ratio, not its numerator/denominator).
function wavg(rows, key, weightKey = 'amount_spent') {
  let num = 0, den = 0;
  for (const r of rows) {
    const v = pf(r[key]); const w = pf(r[weightKey]) || 0;
    if (v == null || w <= 0) continue;
    num += v * w; den += w;
  }
  return den > 0 ? num / den : null;
}

// Reduces one group of daily rows (all belonging to the same ad, ad set, or campaign,
// depending on caller's grouping key) into a single row. Sums the counts, recomputes the
// ratios we have both sides of (ROAS, LC→LPV, CI→Order, CVR) from those sums, and
// spend-weight-averages the rest. Output uses the same field names as a raw DB row so
// generateInsights / CampaignTable / AdRow consume it unchanged.
function combineRows(group) {
  const sum = (k) => group.reduce((s, r) => s + (pf(r[k]) || 0), 0);
  const spend = sum('amount_spent');
  const purchases = sum('website_purchases');
  const checkouts = sum('website_checkouts');
  const lpv = sum('lpv');
  const clicks = sum('link_clicks');
  const revenue = group.reduce((s, r) => s + (pf(r.website_purchases) || 0) * (pf(r.aov) || 0), 0);
  return {
    campaign_name: group[0].campaign_name,
    ad_name: group[0].ad_name,
    ad_set_name: group[0].ad_set_name,
    day: null,
    amount_spent: spend,
    website_purchases: purchases,
    website_checkouts: checkouts,
    lpv, link_clicks: clicks,
    aov: purchases > 0 ? revenue / purchases : null,
    roas: spend > 0 ? revenue / spend : null,
    cost_per_purchase: purchases > 0 ? spend / purchases : null,
    cost_per_lpv: lpv > 0 ? spend / lpv : null,
    cvr_pct: clicks > 0 ? purchases / clicks : null,
    lc_to_lpv: clicks > 0 ? lpv / clicks : null,
    ci_to_order: checkouts > 0 ? purchases / checkouts : null,
    lpv_to_a2c: wavg(group, 'lpv_to_a2c'),
    a2c_to_ci: wavg(group, 'a2c_to_ci'),
    a2c_to_order: wavg(group, 'a2c_to_order'),
    hook_rate: wavg(group, 'hook_rate'),
    ctr_all: wavg(group, 'ctr_all'),
    ctr_link: wavg(group, 'ctr_link'),
    cpm: wavg(group, 'cpm'),
    cpc: clicks > 0 ? spend / clicks : wavg(group, 'cpc'),
    cost_per_purchase_new_customer: wavg(group, 'cost_per_purchase_new_customer'),
  };
}

// Rolls a set of daily ad rows up to one row per ad (the "Whole week" view).
function aggregateAds(rows) {
  const byAd = new Map();
  for (const r of rows) {
    const key = `${r.campaign_name}|||${r.ad_name || ''}`;
    if (!byAd.has(key)) byAd.set(key, []);
    byAd.get(key).push(r);
  }
  return [...byAd.values()].map(combineRows);
}

// Rolls a set of rows up to one row per campaign or per ad set — same reduction as
// aggregateAds, grouped by a coarser key. 'ad' delegates to aggregateAds directly.
function aggregateByLevel(rows, level) {
  if (level === 'ad') return aggregateAds(rows);
  const byKey = new Map();
  for (const r of rows) {
    const key = level === 'campaign' ? r.campaign_name : `${r.campaign_name}|||${r.ad_set_name || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  return [...byKey.values()].map(combineRows);
}

function generateInsights(campaigns, level = 'ad') {
  // All funnel ratios are stored as fractions (0.54 = 54%, and some exceed 1.0) → ×100 to show
  // as %. ROAS is already a multiplier and CTR is already a percent-number, so leave those.
  const nameOf = (r) => level === 'campaign' ? r.campaign_name
    : level === 'adset' ? (r.ad_set_name || r.campaign_name)
    : (r.ad_name || r.campaign_name);
  const c = campaigns.map(r => ({
    name: nameOf(r),
    campaign: r.campaign_name,
    spend: pf(r.amount_spent) || 0,
    purchases: pf(r.website_purchases) || 0,
    roas: pf(r.roas),
    ctr: pf(r.ctr_all),
    cac: pf(r.cost_per_purchase_new_customer),
    lcToLpv: x100(r.lc_to_lpv),
    lpvToA2c: x100(r.lpv_to_a2c),
    a2cToCi: x100(r.a2c_to_ci),
    ciToOrder: x100(r.ci_to_order),
    hookRate: x100(r.hook_rate),
    // Raw funnel-step counts, used as volume floors below so a ratio built from a handful of
    // events (e.g. 3 orders / 2 checkouts = 150%) can't masquerade as a top performer.
    lpv: pf(r.lpv) || 0,
    clicks: pf(r.link_clicks) || 0,
    checkouts: pf(r.website_checkouts) || 0,
  })).filter(r => r.spend > 50);

  const tag = (r) => r.campaign !== r.name ? r.campaign.slice(0, 40) : '';
  const toItem = (r, value) => ({ name: r.name, tag: tag(r), value, spend: r.spend, purchases: r.purchases, ctr: r.ctr, cac: r.cac });

  // Ranks the same metric two ways — worst 20 and best 20 — so an underperformer card always
  // sits next to its "here's what good looks like" counterpart.
  function rankPair(valueOf, fmtValue, { minSpend = 0, worstBelow = null, bestFilter = null, minVolume = null } = {}) {
    const eligible = c.filter(r => valueOf(r) != null && r.spend > minSpend && (!minVolume || minVolume(r)));
    const worstPool = worstBelow != null ? eligible.filter(r => valueOf(r) < worstBelow) : eligible;
    const worst = [...worstPool].sort((a, b) => valueOf(a) - valueOf(b)).slice(0, 20).map(r => toItem(r, fmtValue(valueOf(r))));
    // Zero-valued ties are never a real "best" (a run of no-conversion ads) — drop them, then
    // apply any card-specific floor (e.g. ROAS "scale" candidates need real purchase volume so
    // a fluke 1-purchase 8x ad doesn't masquerade as a scale-up winner).
    let bestPool = eligible.filter(r => valueOf(r) > 0);
    if (bestFilter) bestPool = bestPool.filter(bestFilter);
    const best = [...bestPool].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 20).map(r => toItem(r, fmtValue(valueOf(r))));
    return { worst, best };
  }

  return {
    roasPair: rankPair(r => r.roas, v => `${fmt(v)}x`, { minSpend: 300, worstBelow: 1.5, bestFilter: r => r.purchases >= 3 && r.roas >= 2 }),
    lcToLpvPair: rankPair(r => r.lcToLpv, v => pctD(v), { minSpend: 200, worstBelow: 50, minVolume: r => r.clicks >= 50 }),
    lpvToA2cPair: rankPair(r => r.lpvToA2c, v => pctD(v), { minSpend: 200, minVolume: r => r.lpv >= 50 }),
    a2cToCiPair: rankPair(r => r.a2cToCi, v => pctD(v), { minSpend: 200, minVolume: r => r.checkouts >= 10 }),
    ciToOrderPair: rankPair(r => r.ciToOrder, v => pctD(v), { minSpend: 200, minVolume: r => r.checkouts >= 20 }),
    hookRatePair: rankPair(r => r.hookRate, v => pctD(v), { minSpend: 500, worstBelow: 20 }),
  };
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

function AdRow({ c, isAd, nameOverride, tagOverride, showAdSetCol = true, flat = false }) {
  const roas = pf(c.roas);
  const cpp = pf(c.cost_per_purchase);
  const name = nameOverride ?? (isAd ? (c.ad_name || '(no ad name)') : c.campaign_name);
  return (
    <tr className={`border-b border-border/50 hover:bg-bg transition-colors ${!isAd && !flat ? 'bg-bg/50' : ''}`}>
      <td className={`py-2.5 px-2 text-xs max-w-[240px] truncate ${flat ? 'font-medium text-text-primary' : isAd ? 'pl-6 text-text-secondary' : 'font-medium text-text-primary'}`} title={name}>
        {isAd && !flat && <span className="text-text-muted mr-1">↳</span>}{name}
        {tagOverride && <div className="text-[10px] font-normal text-text-muted truncate">{tagOverride}</div>}
      </td>
      {showAdSetCol && (
        <td className="py-2.5 px-2 text-xs max-w-[160px] truncate text-text-secondary" title={c.ad_set_name || ''}>{c.ad_set_name || '—'}</td>
      )}
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
      <td className="py-2.5 px-2 text-xs text-right text-text-secondary">{pctD(x100(c.hook_rate))}</td>
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
    { h: 'Ad Set', align: 'left' },
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
                  <td />
                  <td className="py-2.5 px-2 text-xs text-right font-medium text-text-primary">{inr(g.totalSpend)}</td>
                  <td colSpan={cols.length - 3} />
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

// Flat (non-nested) rollup table for the Campaign / Ad Set analysis levels — one row per
// entity, sorted by spend, reusing AdRow's metric columns without the campaign→ad drilldown.
function FlatLevelTable({ rows, level }) {
  const sorted = [...rows].sort((a, b) => (pf(b.amount_spent) || 0) - (pf(a.amount_spent) || 0));
  const nameHeader = level === 'campaign' ? 'Campaign' : level === 'adset' ? 'Ad Set' : 'Ad';

  const cols = [
    { h: nameHeader, align: 'left' },
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
          {sorted.map((r, i) => {
            const name = level === 'campaign' ? r.campaign_name
              : level === 'adset' ? (r.ad_set_name || '(no ad set name)')
              : (r.ad_name || '(no ad name)');
            const tag = level === 'campaign' ? '' : r.campaign_name !== name ? r.campaign_name : '';
            return <AdRow key={i} c={r} nameOverride={name} tagOverride={tag} showAdSetCol={false} flat />;
          })}
        </tbody>
      </table>
    </div>
  );
}

// True if the keyword (case-insensitive substring) appears in the campaign, ad set, or ad
// name — a match on any one of the three is enough, since the user's "focus product" could be
// named in the campaign, the ad set, or only the individual ad.
function matchesKeyword(row, keyword) {
  const kw = keyword.toLowerCase();
  return (row.campaign_name || '').toLowerCase().includes(kw)
    || (row.ad_set_name || '').toLowerCase().includes(kw)
    || (row.ad_name || '').toLowerCase().includes(kw);
}

// Keyword search across all uploaded days, rolled up to whichever level the user picks —
// e.g. typing "plant protein" surfaces every campaign/ad set/ad whose name mentions it,
// aggregated the same way as the "All Campaigns" table above.
function FocusProductsCard({ dayData, availableDays }) {
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState('ad');

  const results = useMemo(() => {
    const kw = keyword.trim();
    if (!kw || !availableDays.length) return [];
    const rows = availableDays.flatMap(d => dayData[d].campaigns).filter(r => matchesKeyword(r, kw));
    return aggregateByLevel(rows, level);
  }, [dayData, availableDays, keyword, level]);

  const totalSpend = results.reduce((s, r) => s + (pf(r.amount_spent) || 0), 0);
  const levelNoun = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'ad sets' : 'ads';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">🎯 Focus Products</h2>
          <p className="text-xs text-text-muted mt-0.5">Search a keyword to see every matching campaign, ad set, and ad across the whole week</p>
        </div>
        <LevelSwitch value={level} onChange={setLevel} />
      </div>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="e.g. plant protein, whey, creatine..."
        className="w-full mb-4 px-3 py-2 text-sm rounded-md border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      {!keyword.trim() ? (
        <p className="text-xs text-text-muted py-6 text-center">Type a keyword above to search across campaign, ad set, and ad names.</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-text-muted py-6 text-center">No campaigns, ad sets, or ads match "{keyword.trim()}".</p>
      ) : (
        <>
          <p className="text-xs text-text-secondary mb-3">
            <span className="font-semibold text-text-primary">{results.length}</span> matching {levelNoun} · <span className="font-semibold text-text-primary">{inr(totalSpend)}</span> total spend
          </p>
          {level === 'ad' ? <CampaignTable campaigns={results} /> : <FlatLevelTable rows={results} level={level} />}
        </>
      )}
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
          hookRate: x100(c.hook_rate), ctr: pf(c.ctr_all),
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

// Most common value in a list — used instead of an average so that a handful of null/stale
// rows (or a value repeated on only one of an ad set's several ad rows, which is how Meta's
// per-ad export actually stamps ad-set-level budgets) can't skew the result.
function mode(values) {
  if (!values.length) return null;
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0], bestCount = -1;
  for (const [v, cnt] of counts) if (cnt > bestCount) { best = v; bestCount = cnt; }
  return best;
}

// Meta's CSV carries budget at whichever level is actually optimized (CBO vs ABO) — the other
// column comes through as a descriptive string, which toNumOrNull already turned into null
// server-side. Resolves one ad set's true budget for one day from all of its ad rows: prefers
// its own ad_set_budget (ABO) and falls back to the shared campaign_budget (CBO), tagging
// which source won so campaign-level rollup knows whether to sum or dedupe it (see below).
function resolveAdSetBudget(rows) {
  const abo = rows.map(r => pf(r.ad_set_budget)).filter(v => v != null);
  if (abo.length) return { value: mode(abo), source: 'adset' };
  const cbo = rows.map(r => pf(r.campaign_budget)).filter(v => v != null);
  if (cbo.length) return { value: mode(cbo), source: 'campaign' };
  return null;
}

// Resolves one true budget number per entity for a single day. Averaging every ad row
// together (the old approach) is wrong for ABO campaigns — a campaign with 15 ad sets each
// budgeted differently would have its real total budget diluted into a tiny per-row average.
// Instead: resolve each ad set's own budget first, then for 'campaign' level sum the distinct
// ABO ad-set budgets plus the single shared CBO budget (counted once, not once per ad set).
function resolveDayBudgets(dayData, day, level) {
  const rows = dayData[day]?.campaigns || [];
  const out = new Map();

  if (level === 'ad') {
    const byAd = new Map();
    for (const r of rows) {
      const key = `${r.campaign_name}|||${r.ad_name || ''}`;
      if (!byAd.has(key)) byAd.set(key, []);
      byAd.get(key).push(r);
    }
    for (const [key, group] of byAd) {
      const vals = group.map(r => pf(r.ad_set_budget) != null ? pf(r.ad_set_budget) : pf(r.campaign_budget)).filter(v => v != null);
      if (!vals.length) continue;
      out.set(key, { name: group[0].ad_name || '(no ad name)', tag: group[0].campaign_name, value: mode(vals) });
    }
    return out;
  }

  const byAdSet = new Map();
  for (const r of rows) {
    const key = `${r.campaign_name}|||${r.ad_set_name || ''}`;
    if (!byAdSet.has(key)) byAdSet.set(key, []);
    byAdSet.get(key).push(r);
  }
  const adSetResolved = [];
  for (const group of byAdSet.values()) {
    const resolved = resolveAdSetBudget(group);
    if (!resolved) continue;
    adSetResolved.push({ campaign_name: group[0].campaign_name, ad_set_name: group[0].ad_set_name, ...resolved });
  }

  if (level === 'adset') {
    for (const r of adSetResolved) {
      out.set(`${r.campaign_name}|||${r.ad_set_name}`, { name: r.ad_set_name || '(no ad set name)', tag: r.campaign_name, value: r.value });
    }
    return out;
  }

  // level === 'campaign'
  const byCampaign = new Map();
  for (const r of adSetResolved) {
    if (!byCampaign.has(r.campaign_name)) byCampaign.set(r.campaign_name, { aboSum: 0, cboValue: null });
    const c = byCampaign.get(r.campaign_name);
    if (r.source === 'adset') c.aboSum += r.value;
    else if (c.cboValue == null) c.cboValue = r.value;
  }
  for (const [campaign_name, c] of byCampaign) {
    out.set(campaign_name, { name: campaign_name, tag: '', value: c.aboSum + (c.cboValue || 0) });
  }
  return out;
}

// Averages the resolved per-day budget per entity across a chosen set of days — the average
// degenerates to the single value when only one day is picked, and lets a multi-day pick on
// either side still produce one comparable number per entity.
function budgetsForDays(dayData, days, level) {
  const map = new Map();
  for (const day of days) {
    for (const [key, { name, tag, value }] of resolveDayBudgets(dayData, day, level)) {
      if (!map.has(key)) map.set(key, { name, tag, sum: 0, count: 0 });
      const e = map.get(key);
      e.sum += value; e.count += 1;
    }
  }
  return map;
}

// Compares the average budget on `dateSel` days against `compareSel` days, per entity.
// An entity missing from one side (paused/removed, or newly launched) is treated as budget 0
// on that side rather than skipped — a paused ad set IS a budget cut, and dropping it silently
// is exactly how a real cut can go undetected while individual surviving entities look unchanged.
function detectBudgetChanges(dayData, dateSel, compareSel, level) {
  const curr = budgetsForDays(dayData, dateSel, level);
  const prev = budgetsForDays(dayData, compareSel, level);
  const changes = [];
  const allKeys = new Set([...curr.keys(), ...prev.keys()]);
  for (const key of allKeys) {
    const c = curr.get(key);
    const p = prev.get(key);
    const newBudget = c ? c.sum / c.count : 0;
    const prevBudget = p ? p.sum / p.count : 0;
    if (newBudget === prevBudget) continue;
    const delta = newBudget - prevBudget;
    changes.push({
      name: (c || p).name, tag: (c || p).tag,
      prevBudget, newBudget, delta,
      pct: prevBudget !== 0 ? (delta / prevBudget) * 100 : null,
      direction: delta > 0 ? 'increase' : 'decrease',
      vanished: !c, // had a budget on the "Compare to" side, none on "Date" — likely paused/removed
      appeared: !p, // has a budget on "Date" but had none on "Compare to" — likely newly launched
    });
  }
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return changes;
}

// Multi-select day-chip row shared by the "Date" and "Compare to" pickers.
function DayPicker({ label, availableDays, selected, onToggle, activeClass }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-text-secondary w-24 shrink-0">{label}</span>
      {availableDays.map(d => (
        <button key={d} onClick={() => onToggle(d)}
          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${selected.includes(d) ? activeClass : 'bg-bg text-text-secondary border-border hover:border-accent/50'}`}>
          {d}
        </button>
      ))}
    </div>
  );
}

function SpendChangesTab({ dayData, availableDays }) {
  const [level, setLevel] = useState('campaign');
  const [dateSel, setDateSel] = useState([]);
  const [compareSel, setCompareSel] = useState([]);

  // Until the user picks anything, default to "latest day vs the day before" — derived at
  // render time (not an effect) so there's nothing to seed or resync.
  const defaultDateSel = useMemo(() => (availableDays.length ? [availableDays[availableDays.length - 1]] : []), [availableDays]);
  const defaultCompareSel = useMemo(() => (availableDays.length > 1 ? [availableDays[availableDays.length - 2]] : []), [availableDays]);
  const effectiveDateSel = dateSel.length ? dateSel : defaultDateSel;
  const effectiveCompareSel = compareSel.length ? compareSel : defaultCompareSel;

  const toggleDate = (d) => setDateSel(prev => {
    const base = prev.length ? prev : defaultDateSel;
    return base.includes(d) ? base.filter(x => x !== d) : [...base, d].sort();
  });
  const toggleCompare = (d) => setCompareSel(prev => {
    const base = prev.length ? prev : defaultCompareSel;
    return base.includes(d) ? base.filter(x => x !== d) : [...base, d].sort();
  });

  const changes = useMemo(
    () => (effectiveDateSel.length && effectiveCompareSel.length ? detectBudgetChanges(dayData, effectiveDateSel, effectiveCompareSel, level) : []),
    [dayData, effectiveDateSel, effectiveCompareSel, level]
  );

  const increases = changes.filter(c => c.direction === 'increase');
  const decreases = changes.filter(c => c.direction === 'decrease');
  const increaseTotal = increases.reduce((s, c) => s + c.delta, 0);
  const decreaseTotal = decreases.reduce((s, c) => s + c.delta, 0);
  const levelLabel = levelLabelOf(level);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Budget Changes</h2>
          <p className="text-xs text-text-muted mt-0.5">Compare {levelLabel.toLowerCase()} budget between two date selections</p>
        </div>
        <LevelSwitch value={level} onChange={setLevel} />
      </div>

      <div className="flex flex-col gap-2 mb-4 bg-bg rounded-md p-3 border border-border/50">
        <DayPicker label="Date" availableDays={availableDays} selected={effectiveDateSel} onToggle={toggleDate} activeClass="bg-accent text-white border-accent" />
        <DayPicker label="Compare to" availableDays={availableDays} selected={effectiveCompareSel} onToggle={toggleCompare} activeClass="bg-accent/40 text-text-primary border-accent/60" />
      </div>

      {!effectiveDateSel.length || !effectiveCompareSel.length ? (
        <p className="text-xs text-text-muted py-6 text-center">Select at least one date on each side to compare.</p>
      ) : changes.length === 0 ? (
        <p className="text-xs text-text-muted py-6 text-center">No budget changes detected at the {levelLabel.toLowerCase()} level between these dates.</p>
      ) : (
        <>
          <p className="text-xs text-text-secondary mb-3">
            <span className="font-semibold text-text-primary">{changes.length}</span> budget change{changes.length === 1 ? '' : 's'} detected —{' '}
            <span className="text-positive font-medium">{increases.length} increase{increases.length === 1 ? '' : 's'} ({inr(increaseTotal)})</span>
            {' · '}
            <span className="text-negative font-medium">{decreases.length} decrease{decreases.length === 1 ? '' : 's'} ({inr(Math.abs(decreaseTotal))})</span>
          </p>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2">{levelLabel}</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2">Previous</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2">New</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i} className={`border-b border-border/50 ${c.direction === 'increase' ? 'bg-positive/5' : 'bg-negative/5'}`}>
                    <td className="py-2 px-2 text-xs max-w-[280px] truncate text-text-primary font-medium" title={c.name}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{c.name}</span>
                        {c.vanished && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-negative/15 text-negative">Paused</span>}
                        {c.appeared && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-positive/15 text-positive">New</span>}
                      </span>
                      {c.tag && <div className="text-[10px] font-normal text-text-muted truncate">{c.tag}</div>}
                    </td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{c.vanished ? '—' : inr(c.prevBudget)}</td>
                    <td className="py-2 px-2 text-xs text-right text-text-secondary">{c.appeared ? '—' : inr(c.newBudget)}</td>
                    <td className={`py-2 px-2 text-xs text-right font-semibold ${c.direction === 'increase' ? 'text-positive' : 'text-negative'}`}>
                      {c.direction === 'increase' ? '+' : '−'}{inr(Math.abs(c.delta))}{c.pct != null ? ` (${c.direction === 'increase' ? '+' : '−'}${Math.abs(c.pct).toFixed(0)}%)` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function MetaTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading } = useApi(`/api/analytics/meta-reports?_k=${refreshKey}`);
  const handleUploaded = useCallback(() => setRefreshKey(k => k + 1), []);
  const reports = data?.reports || [];

  const { accountTotal, dayData, availableDays } = useMemo(() => {
    const totals = reports.filter(r => r.campaign_name === TOTAL_MARKER);
    const accountTotal = totals[0] || null;

    const dayData = {};
    for (const r of reports) {
      if (r.campaign_name === TOTAL_MARKER) continue;
      if (!r.day) continue;
      if (!dayData[r.day]) dayData[r.day] = { campaigns: [] };
      dayData[r.day].campaigns.push(r);
    }

    const availableDays = Object.keys(dayData).sort();
    return { accountTotal, dayData, availableDays };
  }, [reports]);

  // 'week' rolls every uploaded day up per ad; otherwise show a specific day's raw rows.
  const [range, setRange] = useState('week');
  // Analysis level for the insight cards below (Underperformers / Ready to Scale / etc.) —
  // rolls the same underlying rows up to campaign, ad set, or ad granularity before ranking.
  const [insightLevel, setInsightLevel] = useState('ad');

  const insightRows = useMemo(() => {
    if (!availableDays.length) return [];
    const rows = range === 'week' ? availableDays.flatMap(d => dayData[d].campaigns) : (dayData[range]?.campaigns || []);
    return aggregateByLevel(rows, insightLevel);
  }, [range, insightLevel, dayData, availableDays]);

  const insights = useMemo(
    () => (insightRows.length ? generateInsights(insightRows, insightLevel) : null),
    [insightRows, insightLevel]
  );

  // "All Campaigns" table always stays at ad level — expanding a campaign there already
  // drills down to its ads, so a separate level strip on this table would be redundant.
  const activeCampaigns = useMemo(() => {
    if (!availableDays.length) return [];
    if (range === 'week') return aggregateAds(availableDays.flatMap(d => dayData[d].campaigns));
    return dayData[range]?.campaigns || [];
  }, [range, dayData, availableDays]);

  const rangeLabel = range === 'week' ? 'Whole week' : range;

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
              <KpiCard label="Hook Rate" value={pctD(x100(accountTotal.hook_rate))} />
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted">{availableDays.length} days of data loaded</p>
        )}
      </div>

      {/* Performance insights — pick a day or the whole week, then compare worst vs best per metric */}
      {availableDays.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-secondary mr-1">View:</span>
              <button onClick={() => setRange('week')}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${range === 'week' ? 'bg-accent text-white border-accent' : 'bg-bg text-text-secondary border-border hover:border-accent/50'}`}>
                Whole week
              </button>
              {availableDays.map(d => (
                <button key={d} onClick={() => setRange(d)}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${range === d ? 'bg-accent text-white border-accent' : 'bg-bg text-text-secondary border-border hover:border-accent/50'}`}>
                  {d}
                </button>
              ))}
            </div>
            <LevelSwitch value={insightLevel} onChange={setInsightLevel} />
          </div>

          {insights && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Underperformers" emoji="🔻" items={insights.roasPair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="Ready to Scale" emoji="🚀" items={insights.roasPair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Low LC → LPV (<50%)" emoji="🔗" items={insights.lcToLpvPair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="High LC → LPV" emoji="🔗" items={insights.lcToLpvPair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Low LPV → ATC" emoji="🛒" items={insights.lpvToA2cPair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="High LPV → ATC" emoji="🛒" items={insights.lpvToA2cPair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Low A2C → CI" emoji="💳" items={insights.a2cToCiPair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="High A2C → CI" emoji="💳" items={insights.a2cToCiPair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Low CI → Order" emoji="📦" items={insights.ciToOrderPair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="High CI → Order" emoji="📦" items={insights.ciToOrderPair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <InsightCard title="Low Hook Rate (<20%)" emoji="🎣" items={insights.hookRatePair.worst} color="text-negative" levelTag={levelLabelOf(insightLevel)} />
                <InsightCard title="High Hook Rate" emoji="🎣" items={insights.hookRatePair.best} color="text-positive" levelTag={levelLabelOf(insightLevel)} />
              </div>
            </>
          )}
        </div>
      )}

      {/* New Ads Launched — by date */}
      {availableDays.length >= 1 && (
        <NewAdsLaunched dayData={dayData} availableDays={availableDays} />
      )}

      {/* Focus Products — keyword search across campaigns/ad sets/ads, with its own level strip */}
      {availableDays.length > 0 && (
        <FocusProductsCard dayData={dayData} availableDays={availableDays} />
      )}

      {/* Budget Changes — independent Campaign/Ad Set/Ad level strip inside the component */}
      {availableDays.length > 0 && (
        <SpendChangesTab dayData={dayData} availableDays={availableDays} />
      )}

      {/* Campaign table — follows the same day/week selector as the insights above. Expanding
          a campaign here already drills down to its ads, so no separate level strip. */}
      {activeCampaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">All Campaigns — {rangeLabel}</h2>
              <p className="text-xs text-text-muted mt-0.5">Sorted by spend</p>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {activeCampaigns.length} ads
            </span>
          </div>
          <CampaignTable campaigns={activeCampaigns} />
        </div>
      )}
    </div>
  );
}
