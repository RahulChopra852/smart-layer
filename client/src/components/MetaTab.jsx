import { useState, useCallback, useMemo, Fragment } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const META_SECTIONS = [
  { id: 'meta-header-kpis', label: 'Overview' },
  { id: 'meta-insights', label: 'Performance Insights' },
  { id: 'meta-focus-products', label: 'Focus Products' },
  { id: 'meta-budget-changes', label: 'Budget Changes' },
  { id: 'meta-budget-leak', label: 'Budget Leak Detector' },
  { id: 'meta-new-ads', label: 'New Ads Launched' },
  { id: 'meta-all-campaigns', label: 'All Campaigns' },
];

// Must match TOTAL_MARKER in server/services/metaParser.js — Meta's CSV "Totals" row is
// stored with this sentinel instead of a blank campaign_name/ad_name (which the DB rejects).
const TOTAL_MARKER = '(account total)';

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const x100 = (v) => { const n = pf(v); return n != null ? n * 100 : null; };
function fmt(n) { if (n == null || isNaN(n)) return '—'; return n.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function inr(n) { if (n == null || isNaN(n)) return '—'; return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
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
  const [sortBySpend, setSortBySpend] = useState(false);
  if (!items.length) return null;
  const sortedItems = sortBySpend ? [...items].sort((a, b) => b.spend - a.spend) : items;
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <span>{emoji} {title}</span>
          {levelTag && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{levelTag}</span>}
        </h3>
        <button onClick={() => setSortBySpend(s => !s)}
          className={`text-[10px] font-medium px-2 py-1 rounded-md border transition-colors shrink-0 ${sortBySpend ? 'bg-accent text-white border-accent' : 'bg-bg text-text-secondary border-border hover:border-accent/50'}`}>
          Sort by spend
        </button>
      </div>
      <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto">
        {sortedItems.map((item, i) => (
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

// ---------------------------------------------------------------------------------------------
// Budget Leak Detector — surfaces spend that's being wasted rather than just spent: ad sets
// nobody's converting on, ad sets fatiguing an audience into rising costs, ad sets whose cost
// efficiency is actively getting worse over the range, campaigns competing with each other for
// the same product/audience, and spend driving traffic to products that are currently out of
// stock. Computed entirely client-side from the same dayData/availableDays MetaTab already has
// loaded (plus a light cross-reference against the Revenue Leak OOS data) — no new data source.
// ---------------------------------------------------------------------------------------------

const LEAK_MIN_SPEND = 300;          // floor below which a metric-based flag is just noise
const HIGH_FREQUENCY = 3;            // Meta's own guidance: 3+ = audience fatigue risk
const DEAD_WEIGHT_MIN_SPEND = 500;   // spend with zero purchases, above this, is a real leak
const RISING_COST_MIN_SPEND = 500;   // combined spend across both halves of the range
const RISING_COST_THRESHOLD = 0.25;  // 25%+ CPP increase from first half to second half

// Words that show up in nearly every campaign/ad-set name regardless of product — stripping
// them leaves only the tokens that actually identify what's being sold, so two campaigns for
// the same product cluster together even when their audience/targeting suffixes differ.
const CAMPAIGN_STOPWORDS = new Set([
  'gnc', 'gncindia', 'gnc_india', 'india', 'ba', 'sales', 'sale', 'tof', 'mof', 'bof', 'cbo', 'auto',
  'manual', 'lal', 'ot', 'dt', 'hhi', 'hni', 'mf', 'm', 'f', 'mix', 'cold', 'warm', 'advantage',
  'using', 'test', 'budget', 'ad', 'set', 'ads', 'catalogue', 'launch', 'new', 'daily', 'via',
  'only', 'from', 'with', 'and', 'the', 'of', 'for', 'all', 'products', 'product', 'image',
  'video', 'images', 'videos', 'copy',
  // Month names — nearly every campaign name ends with a date, so left unstripped these become
  // the single most common token in the account and silently chain unrelated campaigns together
  // (two campaigns sharing only "fitness"+"july" would otherwise cluster despite selling nothing
  // in common — this is what caused an early version to merge 12 unrelated campaigns into one).
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may', 'jun', 'june',
  'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september', 'oct', 'october', 'nov',
  'november', 'dec', 'december',
]);

function extractCoreTokens(name) {
  if (!name) return [];
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !/^\d+$/.test(t) && !CAMPAIGN_STOPWORDS.has(t));
}

// Meta campaign names use internal shorthand that shares no words with the Shopify product
// title it's actually promoting ("PP Whey" = "Pro Performance Whey", "TSFO" = "Triple Strength
// Fish Oil") — a plain token-overlap match can never catch these, so they're expanded by hand.
const CAMPAIGN_KEYWORD_ALIASES = { pp: ['whey'], tsfo: ['triple', 'strength', 'fish', 'oil'] };

// A campaign matches a product if it contains a known alias whose expansion appears in the
// product's tokens (a targeted, curated signal), OR if it shares 2+ literal tokens with the
// product (requiring 2 avoids one generic word like "protein" or "isolate" — which recur across
// a dozen unrelated products in this catalog — being treated as proof of a real match).
// campaignTokensArr is deduped into a Set first: campaign and ad-set names largely repeat each
// other (e.g. both contain "Yeast Protein Launch"), so counting the raw array would double-count
// one shared word as if it were two.
function campaignMatchesProduct(campaignTokensArr, pTokens) {
  const campaignTokens = new Set(campaignTokensArr);
  for (const t of campaignTokens) {
    const expansion = CAMPAIGN_KEYWORD_ALIASES[t];
    if (expansion && expansion.some(e => pTokens.has(e))) return true;
  }
  let shared = 0;
  for (const t of campaignTokens) if (pTokens.has(t)) shared++;
  return shared >= 2;
}

// TOF/MOF/BOF campaigns for the same product are normal funnel structure, not cannibalization —
// only cluster campaigns that share both a funnel stage AND product-level keywords below.
function detectFunnelStage(name) {
  const raw = (name || '').toLowerCase().split(/[^a-z0-9]+/);
  if (raw.includes('tof')) return 'TOF';
  if (raw.includes('mof')) return 'MOF';
  if (raw.includes('bof')) return 'BOF';
  return null;
}

// Rolls all days up to one row per ad set, keeping each day's raw row too (rows) — the fatigue
// and rising-cost checks need the trend across days, not just the period total combineRows gives.
function aggregateAdSetsWithSeries(dayData, availableDays) {
  const byAdSet = new Map();
  for (const day of availableDays) {
    for (const r of dayData[day]?.campaigns || []) {
      const key = `${r.campaign_name}|||${r.ad_set_name || ''}`;
      if (!byAdSet.has(key)) byAdSet.set(key, { name: r.ad_set_name || '(no ad set name)', campaign: r.campaign_name, rows: [] });
      byAdSet.get(key).rows.push({ day, ...r });
    }
  }
  return [...byAdSet.values()].map(({ name, campaign, rows }) => {
    const sortedRows = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const combined = combineRows(sortedRows);
    const spendWeight = sortedRows.reduce((s, r) => s + (pf(r.amount_spent) || 0), 0);
    const freqVals = sortedRows.map(r => pf(r.frequency)).filter(v => v != null);
    const avgFrequency = freqVals.length && spendWeight > 0
      ? sortedRows.reduce((s, r) => s + (pf(r.frequency) || 0) * (pf(r.amount_spent) || 0), 0) / spendWeight
      : (freqVals.length ? freqVals.reduce((a, b) => a + b, 0) / freqVals.length : null);
    return { ...combined, key: `${campaign}|||${name}`, name, campaign, rows: sortedRows, avgFrequency };
  });
}

function detectDeadWeight(adSets) {
  return adSets
    .filter(a => (pf(a.amount_spent) || 0) >= DEAD_WEIGHT_MIN_SPEND && (pf(a.website_purchases) || 0) === 0)
    .sort((a, b) => (pf(b.amount_spent) || 0) - (pf(a.amount_spent) || 0));
}

function detectAdFatigue(adSets) {
  return adSets
    .filter(a => a.avgFrequency != null && a.avgFrequency >= HIGH_FREQUENCY && (pf(a.amount_spent) || 0) >= LEAK_MIN_SPEND)
    .sort((a, b) => b.avgFrequency - a.avgFrequency);
}

// Splits each ad set's daily rows into an early half and a late half of the uploaded range and
// compares cost-per-purchase between them — a real efficiency trend, not just a single bad day.
// "Early"/"late" are relative to each ad set's own active days, not fixed calendar dates — an ad
// set launched partway through the range still gets its own days split down the middle, so a
// date-range label is attached per row rather than one fixed pair of dates for the whole table.
const dateRangeLabel = (rows) => rows.length === 1 ? rows[0].day.slice(5) : `${rows[0].day.slice(5)}–${rows[rows.length - 1].day.slice(5)}`;

function detectRisingCost(adSets) {
  const out = [];
  for (const a of adSets) {
    if (a.rows.length < 2) continue;
    const mid = Math.ceil(a.rows.length / 2);
    const firstHalf = a.rows.slice(0, mid);
    const secondHalf = a.rows.slice(mid);
    if (!secondHalf.length) continue;
    const sumSpend = (rows) => rows.reduce((s, r) => s + (pf(r.amount_spent) || 0), 0);
    const sumPurch = (rows) => rows.reduce((s, r) => s + (pf(r.website_purchases) || 0), 0);
    const firstSpend = sumSpend(firstHalf), firstPurch = sumPurch(firstHalf);
    const secondSpend = sumSpend(secondHalf), secondPurch = sumPurch(secondHalf);
    if (firstSpend + secondSpend < RISING_COST_MIN_SPEND || firstPurch === 0) continue;
    const firstCpp = firstSpend / firstPurch;
    const firstRange = dateRangeLabel(firstHalf);
    const secondRange = dateRangeLabel(secondHalf);
    if (secondPurch === 0) { out.push({ ...a, firstCpp, secondCpp: null, firstRange, secondRange, collapsed: true }); continue; }
    const secondCpp = secondSpend / secondPurch;
    const pctChange = (secondCpp - firstCpp) / firstCpp;
    if (pctChange >= RISING_COST_THRESHOLD) out.push({ ...a, firstCpp, secondCpp, firstRange, secondRange, collapsed: false, pctChange });
  }
  return out.sort((a, b) => (pf(b.amount_spent) || 0) - (pf(a.amount_spent) || 0));
}

// Union-find over campaigns (not ad sets — cannibalization is a cross-campaign concern, since ad
// sets inside one campaign already share a budget by design): two campaigns cluster together
// when they're the same funnel stage and share 2+ product-identifying tokens in their names.
function detectCompetingCampaigns(campaignRows) {
  const entries = campaignRows
    .filter(c => (pf(c.amount_spent) || 0) > 100)
    .map(c => ({
      name: c.campaign_name,
      spend: pf(c.amount_spent) || 0,
      purchases: pf(c.website_purchases) || 0,
      roas: pf(c.roas),
      stage: detectFunnelStage(c.campaign_name),
      tokens: new Set(extractCoreTokens(c.campaign_name)),
    }));

  const parent = entries.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i].stage !== entries[j].stage) continue;
      let shared = 0;
      for (const t of entries[i].tokens) if (entries[j].tokens.has(t)) shared++;
      if (shared >= 2) union(i, j);
    }
  }

  const groups = new Map();
  entries.forEach((e, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(e);
  });

  return [...groups.values()]
    .filter(g => g.length >= 2)
    .map(g => ({
      campaigns: [...g].sort((a, b) => b.spend - a.spend),
      totalSpend: g.reduce((s, c) => s + c.spend, 0),
      totalPurchases: g.reduce((s, c) => s + c.purchases, 0),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

// Cross-references ad set/campaign names against currently-OOS products with 500+ sessions
// (Shopify handles confirm similar-sounding titles are often genuinely different product
// listings, so products are never merged up front on name similarity — only after matching, and
// only when two products resolve to the exact same set of matched ad sets, meaning the ad
// naming genuinely can't distinguish which one the spend belongs to).
function detectOosSpendWaste(adSets, oosProducts, availableDays) {
  if (!oosProducts?.length) return [];
  const raw = [];
  for (const product of oosProducts) {
    const pTokens = new Set(extractCoreTokens(product.product_title).filter(t => t.length >= 3));
    if (pTokens.size < 2) continue;
    const matches = adSets.filter(a => campaignMatchesProduct(extractCoreTokens(`${a.campaign} ${a.name}`), pTokens));
    const spend = matches.reduce((s, a) => s + (pf(a.amount_spent) || 0), 0);
    if (spend > 0) raw.push({ product: product.product_title, sessions: product.sessions, oosSince: product.oosSince, matches, spend });
  }

  const bySignature = new Map();
  for (const r of raw) {
    const sig = r.matches.map(a => a.key).sort().join('\n');
    if (!bySignature.has(sig)) bySignature.set(sig, { titles: [], sessions: 0, oosSince: r.oosSince, matches: r.matches.sort((a, b) => (pf(b.amount_spent) || 0) - (pf(a.amount_spent) || 0)), spend: r.spend });
    const e = bySignature.get(sig);
    e.titles.push(r.product);
    e.sessions += r.sessions;
    // Multiple merged products can each have gone OOS on a different date — keep the earliest,
    // since that's when this ad spend first became waste rather than legitimate traffic.
    if (r.oosSince && (!e.oosSince || r.oosSince < e.oosSince)) e.oosSince = r.oosSince;
  }

  // Day-by-day spend across the matched ad sets, for the cross-verification chart — zero-filled
  // against the full uploaded range so a product's chart lines up with every other product's.
  return [...bySignature.values()].map(e => {
    const byDay = new Map(availableDays.map(d => [d, 0]));
    for (const a of e.matches) {
      for (const r of a.rows) byDay.set(r.day, (byDay.get(r.day) || 0) + (pf(r.amount_spent) || 0));
    }
    return {
      product: e.titles.join(' / '), sessions: e.sessions, oosSince: e.oosSince,
      matches: e.matches, spend: e.spend,
      dailySpend: availableDays.map(d => ({ day: d, spend: byDay.get(d) || 0 })),
    };
  }).sort((a, b) => b.spend - a.spend);
}

const OOS_SESSIONS_THRESHOLD = 500;

// Collapsed-by-default section header (matches the CampaignTable/NewAdsLaunched convention
// elsewhere in this file) — the detector can flag five different things at once, and forcing
// every table open by default made the card too long to scan for what actually needs attention.
function LeakAccordion({ emoji, title, count, subtitle, spendLabel, spendValue, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-bg rounded-md border border-border/50">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 p-3 flex-wrap text-left">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <span className="text-text-muted text-[10px]">{open ? '▼' : '▶'}</span>
            <span>{emoji} {title}</span>
            {count != null && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-negative/15 text-negative">{count}</span>}
          </h3>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {spendValue != null && (
          <div className="text-right shrink-0">
            <div className="text-[10px] text-text-muted uppercase">{spendLabel}</div>
            <div className="text-sm font-bold text-negative">{inr(spendValue)}</div>
          </div>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// Plain inline SVG bar chart (no charting library in this project) — one bar per uploaded day of
// spend on the matched ad sets, with a dashed marker at the product's oos_since date so spend
// before vs. after the product actually went OOS is visually distinguishable. That's the
// cross-check: bars still lit up red well past the marker are the real waste.
function DailySpendChart({ dailySpend, oosSince }) {
  if (!dailySpend.length) return null;
  const max = Math.max(1, ...dailySpend.map(d => d.spend));
  const barW = 100 / dailySpend.length;
  const oosIndex = oosSince ? dailySpend.findIndex(d => d.day >= oosSince) : -1;
  return (
    <div className="mt-2">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-14">
        {oosIndex >= 0 && (
          <rect x={oosIndex * barW} y="0" width={100 - oosIndex * barW} height="40" className="fill-negative/5" />
        )}
        {dailySpend.map((d, i) => {
          const h = (d.spend / max) * 36;
          const beforeOos = oosIndex >= 0 && i < oosIndex;
          return (
            <rect key={d.day} x={i * barW + barW * 0.15} y={40 - h} width={Math.max(barW * 0.7, 0.5)} height={h}
              className={beforeOos ? 'fill-text-muted/50' : 'fill-negative/70'}>
              <title>{`${d.day}: ${inr(d.spend)}`}</title>
            </rect>
          );
        })}
        {oosIndex >= 0 && (
          <line x1={oosIndex * barW} y1="0" x2={oosIndex * barW} y2="40" className="stroke-negative" strokeWidth="0.6" strokeDasharray="2,1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-text-muted mt-0.5">
        <span>{dailySpend[0].day.slice(5)}</span>
        {oosSince && <span className="text-negative font-medium">┊ OOS since {oosSince.slice(5)}</span>}
        <span>{dailySpend[dailySpend.length - 1].day.slice(5)}</span>
      </div>
    </div>
  );
}

function BudgetLeakDetector({ dayData, availableDays }) {
  // Reuses the same OOS-with-sessions computation already powering the Products tab's "Sessions
  // Lost While OOS" card, rather than re-deriving it — one source of truth for what's OOS and
  // how much traffic it's still getting.
  const { data: oosData } = useApi('/api/analytics/oos-sessions');
  const oosAbove500 = useMemo(
    () => (oosData?.oosWithSessions || [])
      .filter(p => (p.sessions_during_oos || 0) >= OOS_SESSIONS_THRESHOLD)
      .map(p => ({ product_title: p.product_title, sessions: p.sessions_during_oos, oosSince: p.oos_since })),
    [oosData]
  );

  const adSets = useMemo(() => aggregateAdSetsWithSeries(dayData, availableDays), [dayData, availableDays]);
  const campaignRows = useMemo(() => aggregateByLevel(availableDays.flatMap(d => dayData[d]?.campaigns || []), 'campaign'), [dayData, availableDays]);

  const deadWeight = useMemo(() => detectDeadWeight(adSets), [adSets]);
  const fatigue = useMemo(() => detectAdFatigue(adSets), [adSets]);
  const risingCost = useMemo(() => detectRisingCost(adSets), [adSets]);
  const competing = useMemo(() => detectCompetingCampaigns(campaignRows), [campaignRows]);
  const oosWaste = useMemo(() => detectOosSpendWaste(adSets, oosAbove500, availableDays), [adSets, oosAbove500, availableDays]);
  const hasFrequencyData = adSets.some(a => a.avgFrequency != null);

  const deadWeightSpend = deadWeight.reduce((s, a) => s + (pf(a.amount_spent) || 0), 0);
  const fatigueSpend = fatigue.reduce((s, a) => s + (pf(a.amount_spent) || 0), 0);
  const risingCostSpend = risingCost.reduce((s, a) => s + (pf(a.amount_spent) || 0), 0);
  const competingSpend = competing.reduce((s, g) => s + g.totalSpend, 0);
  const oosWasteSpend = oosWaste.reduce((s, o) => s + o.spend, 0);
  const totalIssues = deadWeight.length + fatigue.length + risingCost.length + competing.length + oosWaste.length;

  if (!availableDays.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">🚨 Budget Leak Detector</h2>
          <p className="text-xs text-text-muted mt-0.5">Spend that's being wasted, not just spent — across all {availableDays.length} uploaded days</p>
        </div>
        {totalIssues > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">{totalIssues} issue{totalIssues === 1 ? '' : 's'} flagged</span>
        )}
      </div>

      {totalIssues === 0 && hasFrequencyData ? (
        <p className="text-xs text-text-muted py-6 text-center">No major leak signals in the uploaded range.</p>
      ) : (
        <div className="flex flex-col gap-4">

          {deadWeight.length > 0 && (
            <LeakAccordion emoji="💀" title="Not Working" count={deadWeight.length}
              subtitle={`Ad sets spending ≥${inr(DEAD_WEIGHT_MIN_SPEND)} with zero purchases across the range`}
              spendLabel="Wasted" spendValue={deadWeightSpend}>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Ad Set</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Spend</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">CTR</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Checkouts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadWeight.map(a => (
                      <tr key={a.key} className="border-b border-border/50">
                        <td className="py-2 px-2 text-xs max-w-[280px] truncate text-text-primary" title={`${a.name}\n${a.campaign}`}>
                          <div className="truncate font-medium">{a.name}</div>
                          <div className="truncate text-[10px] text-text-muted">{a.campaign}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-right font-semibold text-negative">{inr(pf(a.amount_spent))}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{pctD(pf(a.ctr_all))}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(pf(a.website_checkouts))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LeakAccordion>
          )}

          <LeakAccordion emoji="🔥" title="Ad Fatigue (High Frequency)" count={fatigue.length > 0 ? fatigue.length : null}
            subtitle={`Frequency ≥${HIGH_FREQUENCY} — same audience seeing the ad repeatedly, CPMs typically climb from here`}
            spendLabel="At risk" spendValue={fatigue.length > 0 ? fatigueSpend : null}>
            {!hasFrequencyData ? (
              <p className="text-xs text-text-muted py-3 text-center">Frequency wasn't captured in these uploads yet — re-upload the latest Meta CSV to enable this check.</p>
            ) : fatigue.length === 0 ? (
              <p className="text-xs text-text-muted py-3 text-center">No ad sets above the frequency threshold.</p>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Ad Set</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Frequency</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">CPM</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Spend</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fatigue.map(a => (
                      <tr key={a.key} className="border-b border-border/50">
                        <td className="py-2 px-2 text-xs max-w-[280px] truncate text-text-primary" title={`${a.name}\n${a.campaign}`}>
                          <div className="truncate font-medium">{a.name}</div>
                          <div className="truncate text-[10px] text-text-muted">{a.campaign}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-right font-semibold text-negative">{fmt(a.avgFrequency)}x</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{inr(pf(a.cpm))}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{inr(pf(a.amount_spent))}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(pf(a.roas))}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LeakAccordion>

          {risingCost.length > 0 && (
            <LeakAccordion emoji="📈" title="Rising Cost Per Purchase" count={risingCost.length}
              subtitle={`CPP climbed ${Math.round(RISING_COST_THRESHOLD * 100)}%+ from the first half of this ad set's active days to the second half (or conversions stopped entirely) — split down the middle of each ad set's own days, not a fixed calendar date, so "early"/"late" differ per row (see the date range under each value)`}
              spendLabel="Total spend" spendValue={risingCostSpend}>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Ad Set</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">CPP (early)</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">CPP (late)</th>
                      <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risingCost.map(a => (
                      <tr key={a.key} className="border-b border-border/50">
                        <td className="py-2 px-2 text-xs max-w-[280px] truncate text-text-primary" title={`${a.name}\n${a.campaign}`}>
                          <div className="truncate font-medium">{a.name}</div>
                          <div className="truncate text-[10px] text-text-muted">{a.campaign}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">
                          {inr(a.firstCpp)}
                          <div className="text-[9px] text-text-muted font-normal">{a.firstRange}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-right font-semibold text-negative">
                          {a.collapsed ? 'no purchases' : inr(a.secondCpp)}
                          <div className="text-[9px] text-text-muted font-normal">{a.secondRange}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-right font-semibold text-negative">{a.collapsed ? 'stopped converting' : `+${Math.round(a.pctChange * 100)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LeakAccordion>
          )}

          {competing.length > 0 && (
            <LeakAccordion emoji="⚔️" title="Competing Campaigns" count={competing.length}
              subtitle="Same funnel stage, same product keywords, different campaigns — likely bidding against each other for the same audience"
              spendLabel="Combined spend" spendValue={competingSpend}>
              <div className="flex flex-col gap-2">
                {competing.map((g, i) => (
                  <div key={i} className="bg-card rounded-md p-2.5 border border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-text-secondary">{g.campaigns.length} campaigns · {fmt(g.totalPurchases)} purchases combined</span>
                      <span className="text-xs font-bold text-negative">{inr(g.totalSpend)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {g.campaigns.map((c, j) => (
                        <div key={j} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-text-primary truncate" title={c.name}>{c.name}</span>
                          <span className="text-text-muted shrink-0">{inr(c.spend)} · {fmt(c.purchases)} purch · {c.roas != null ? `${fmt(c.roas)}x` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </LeakAccordion>
          )}

          {oosWaste.length > 0 && (
            <LeakAccordion emoji="📦" title="Spend On Out-Of-Stock Products" count={oosWaste.length}
              subtitle="Products with 500+ sessions while OOS, matched against ad names still driving traffic there"
              spendLabel="Spend" spendValue={oosWasteSpend}>
              <div className="flex flex-col gap-2">
                {oosWaste.map((o, i) => (
                  <div key={i} className="bg-card rounded-md p-2.5 border border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-text-primary truncate" title={o.product}>{o.product}</span>
                      <span className="text-[11px] text-text-muted shrink-0">{fmt(o.sessions)} sessions OOS</span>
                    </div>
                    <DailySpendChart dailySpend={o.dailySpend} oosSince={o.oosSince} />
                    <div className="flex flex-col gap-1 mt-2">
                      {o.matches.map((a, j) => (
                        <div key={j} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-text-secondary truncate" title={`${a.name} / ${a.campaign}`}>{a.name}</span>
                          <span className="text-negative font-medium shrink-0">{inr(pf(a.amount_spent))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </LeakAccordion>
          )}

        </div>
      )}
    </div>
  );
}

export default function MetaTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading } = useApi(`/api/analytics/meta-reports?_k=${refreshKey}`);
  const handleUploaded = useCallback(() => setRefreshKey(k => k + 1), []);
  const reports = data?.reports || [];

  const { dayData, availableDays } = useMemo(() => {
    const dayData = {};
    for (const r of reports) {
      if (r.campaign_name === TOTAL_MARKER) continue;
      if (!r.day) continue;
      if (!dayData[r.day]) dayData[r.day] = { campaigns: [] };
      dayData[r.day].campaigns.push(r);
    }

    const availableDays = Object.keys(dayData).sort();
    return { dayData, availableDays };
  }, [reports]);

  // Meta's own "Totals" row (accountTotal) only reflects whichever single CSV upload happened to
  // be first in the reports list — with multiple days' reports uploaded, that silently showed
  // one arbitrary day's numbers labeled as if they were the account's overall performance.
  // combineRows re-sums every real campaign/ad row across every uploaded day into one true
  // combined total instead, and (as a bonus) no longer depends on a Totals row existing at all.
  const combinedTotal = useMemo(() => {
    const allRows = availableDays.flatMap(d => dayData[d].campaigns);
    return allRows.length ? combineRows(allRows) : null;
  }, [dayData, availableDays]);

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
      <SectionNav sections={META_SECTIONS} />
      {/* Header + KPIs */}
      <div className="bg-card border border-border rounded-lg p-4" id="meta-header-kpis">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Meta Ads Analysis</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {availableDays.length ? `${availableDays[0]} to ${availableDays[availableDays.length - 1]} · combined across all ads` : 'Upload daily Meta CSV exports'}
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
        ) : combinedTotal ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCard label="Total Spend" value={inr(pf(combinedTotal.amount_spent))} />
              <KpiCard label="Purchases" value={fmt(pf(combinedTotal.website_purchases))} />
              <KpiCard label="ROAS" value={`${fmt(pf(combinedTotal.roas))}x`} color={pf(combinedTotal.roas) >= 2.5 ? 'text-positive' : 'text-negative'} />
              <KpiCard label="AOV" value={inr(pf(combinedTotal.aov))} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
              <KpiCard label="Link Clicks" value={fmt(pf(combinedTotal.link_clicks))} sub="users who clicked the ad" />
              <KpiCard label="LC → LPV" value={pctD(x100(combinedTotal.lc_to_lpv))} sub={`${fmt(pf(combinedTotal.lpv))} LPVs`} />
              <KpiCard label="LPV → A2C" value={pctD(x100(combinedTotal.lpv_to_a2c))} sub="landing page view → add to cart" />
              <KpiCard label="A2C → CI" value={pctD(x100(combinedTotal.a2c_to_ci))} />
              <KpiCard label="CI → Order" value={pctD(x100(combinedTotal.ci_to_order))} />
              <KpiCard label="CVR" value={pctD(x100(combinedTotal.cvr_pct))} />
              <KpiCard label="Hook Rate" value={pctD(x100(combinedTotal.hook_rate))} />
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted">{availableDays.length} days of data loaded</p>
        )}
      </div>

      {/* Performance insights — pick a day or the whole week, then compare worst vs best per metric */}
      {availableDays.length > 0 && (
        <div className="flex flex-col gap-4" id="meta-insights">
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

      {/* Focus Products — keyword search across campaigns/ad sets/ads, with its own level strip */}
      {availableDays.length > 0 && (
        <div id="meta-focus-products"><FocusProductsCard dayData={dayData} availableDays={availableDays} /></div>
      )}

      {/* Budget Changes — independent Campaign/Ad Set/Ad level strip inside the component */}
      {availableDays.length > 0 && (
        <div id="meta-budget-changes"><SpendChangesTab dayData={dayData} availableDays={availableDays} /></div>
      )}

      {/* Budget Leak Detector — sits right after Budget Changes since both live in the same
          "what's going wrong with spend" mental space, but this one looks at waste rather than
          just budget deltas. */}
      {availableDays.length > 0 && (
        <div id="meta-budget-leak"><BudgetLeakDetector dayData={dayData} availableDays={availableDays} /></div>
      )}

      {/* New Ads Launched — sits right above All Campaigns so a fresh launch is the last thing
          you check before the full campaign breakdown. */}
      {availableDays.length >= 1 && (
        <div id="meta-new-ads"><NewAdsLaunched dayData={dayData} availableDays={availableDays} /></div>
      )}

      {/* Campaign table — follows the same day/week selector as the insights above. Expanding
          a campaign here already drills down to its ads, so no separate level strip. */}
      {activeCampaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4" id="meta-all-campaigns">
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
