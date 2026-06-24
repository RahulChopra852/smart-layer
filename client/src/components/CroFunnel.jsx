import { useState } from 'react';
import { useApi } from '../hooks/useApi';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString();
}

function pct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function Delta({ value, suffix = 'pt' }) {
  if (value == null || isNaN(value)) return <span className="text-[11px] text-text-muted">—</span>;
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span className={`text-[11px] font-medium ${pos ? 'text-positive' : neg ? 'text-negative' : 'text-text-muted'}`}>
      {pos ? '+' : ''}{value.toFixed(2)}{suffix}
    </span>
  );
}

function pickLatest(rows) {
  if (!rows || rows.length === 0) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.sessions > 0 && r.atc > 0 && r.atc < r.sessions && r.ic != null && r.ic > 0) return r;
  }
  return rows[rows.length - 1];
}

function generateAnalysis(today, yesterday, allRows) {
  const up = [];
  const down = [];
  const dates = { realtime: today?.date || '—', historical: yesterday?.date || '—' };

  // For IC and RPP: compare yesterday vs day-before-yesterday
  const prev = allRows && allRows.length >= 3 ? allRows[allRows.length - 3] : null;

  function add(label, delta, suffix, threshold) {
    if (delta == null || isNaN(delta)) return;
    if (Math.abs(delta) < threshold) return;
    const entry = { metric: label, delta: Math.abs(delta).toFixed(2), suffix };
    if (delta > 0) up.push(entry);
    else down.push(entry);
  }

  // Real-time: sessions, ATC, CVR, orders (today vs yesterday)
  if (today) {
    if (today.sessions_dod != null) {
      const base = today.sessions - today.sessions_dod;
      if (base > 0) {
        const p = (today.sessions_dod / base) * 100;
        if (Math.abs(p) > 3) {
          const entry = { metric: 'Sessions', delta: Math.abs(p).toFixed(0), suffix: '%' };
          if (p > 0) up.push(entry); else down.push(entry);
        }
      }
    }
    add('ATC rate', today.atc_pct_dod, 'pt', 0.2);
    add('CVR', today.cvr_pct_dod, 'pt', 0.2);
    if (today.orders_dod != null && Math.abs(today.orders_dod) > 0) {
      const entry = { metric: 'Orders', delta: Math.abs(today.orders_dod).toFixed(0), suffix: '' };
      if (today.orders_dod > 0) up.push(entry); else down.push(entry);
    }
  }

  // Historical: IC and RPP (yesterday vs day-before-yesterday)
  if (yesterday && prev) {
    const icY = parseFloat(yesterday.ic_pct);
    const icP = parseFloat(prev.ic_pct);
    if (!isNaN(icY) && !isNaN(icP) && Math.abs(icY - icP) >= 0.2) {
      const d = icY - icP;
      const entry = { metric: `IC rate (${yesterday.date?.slice(5)})`, delta: Math.abs(d).toFixed(2), suffix: 'pt' };
      if (d > 0) up.push(entry); else down.push(entry);
    }
    const rppY = parseFloat(yesterday.rpp_pct);
    const rppP = parseFloat(prev.rpp_pct);
    if (!isNaN(rppY) && !isNaN(rppP) && Math.abs(rppY - rppP) >= 0.2) {
      const d = rppY - rppP;
      const entry = { metric: `RPP rate (${yesterday.date?.slice(5)})`, delta: Math.abs(d).toFixed(2), suffix: 'pt' };
      if (d > 0) up.push(entry); else down.push(entry);
    }
  }

  return { up, down, dates };
}

// SVG line chart
function TrendChart({ rows, metricKey, label, color = '#6366F1' }) {
  if (!rows || rows.length < 2) return null;
  const values = rows.map(r => parseFloat(r[metricKey])).filter(v => !isNaN(v));
  if (values.length < 2) return null;

  const w = 320, h = 80, pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return { x, y, v };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${h - pad} L${points[0].x},${h - pad} Z`;

  const dates = rows.map(r => r.date).filter(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{values[values.length - 1].toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id={`grad-${metricKey}-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#grad-${metricKey}-${color.replace('#','')})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2} fill={i === points.length - 1 ? color : 'white'} stroke={color} strokeWidth="1.5" />
        ))}
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-text-muted">{dates[0]?.slice(5)}</span>
        <span className="text-[9px] text-text-muted">{dates[dates.length - 1]?.slice(5)}</span>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, rate, isLast }) {
  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex-1 text-center px-1">
        <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
        <div className="text-lg font-bold text-text-primary mt-0.5">{fmt(value)}</div>
        {rate != null && (
          <div className="text-xs font-medium text-accent mt-0.5">{pct(rate)}</div>
        )}
      </div>
      {!isLast && (
        <div className="text-text-muted/25 text-xl shrink-0">&rsaquo;</div>
      )}
    </div>
  );
}

function ChannelCard({ title, latest, allRows, sessionKey, visitors }) {
  if (!latest) return <p className="text-xs text-text-muted py-4">No data available</p>;

  const sessions = latest[sessionKey] ?? latest.sessions;
  if (sessions == null || sessions === 0) return <p className="text-xs text-text-muted py-4">No session data</p>;

  const yesterday = allRows && allRows.length >= 2 ? allRows[allRows.length - 2] : null;
  const analysis = generateAnalysis(latest, yesterday, allRows);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {latest.cvr_pct != null && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${latest.cvr_pct >= 3 ? 'bg-positive/15 text-positive' : 'bg-accent/15 text-accent'}`}>
              CVR {pct(latest.cvr_pct)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-muted">{latest.date}</span>
      </div>

      {/* Funnel — clean horizontal */}
      <div className="flex items-start bg-bg rounded-lg p-3 border border-border/50">
        <FunnelStep label="Sessions" value={sessions} />
        <FunnelStep label="ATC" value={latest.atc} rate={latest.atc_pct} />
        <FunnelStep label="IC" value={latest.ic} rate={latest.ic_pct} />
        <FunnelStep label="RPP" value={latest.rpp} rate={latest.rpp_pct} />
        <FunnelStep label="Orders" value={latest.orders} isLast />
      </div>

      {/* Visitors + Orders breakdown */}
      <div className="flex gap-2">
        {visitors != null && (
          <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted">Visitors</div>
            <div className="text-sm font-bold text-text-primary">{fmt(visitors)}</div>
          </div>
        )}
        {latest.web_orders > 0 && (
          <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted">Web Orders</div>
            <div className="text-sm font-bold text-text-primary">{fmt(latest.web_orders)}</div>
          </div>
        )}
        {latest.app_orders > 0 && (
          <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted">App Orders</div>
            <div className="text-sm font-bold text-text-primary">{fmt(latest.app_orders)}</div>
          </div>
        )}
        {(latest.atc_to_ci > 0 || latest.ci_to_rpp > 0 || latest.rpp_to_ord > 0) &&
          [{ l: 'ATC→CI', v: latest.atc_to_ci }, { l: 'CI→RPP', v: latest.ci_to_rpp }, { l: 'RPP→Ord', v: latest.rpp_to_ord }]
            .filter(s => s.v != null && s.v > 0)
            .map(s => (
              <div key={s.l} className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted">{s.l}</div>
                <div className="text-xs font-semibold text-text-primary">{pct(s.v)}</div>
              </div>
            ))
        }
      </div>

      {/* Trend charts */}
      {allRows && allRows.length >= 2 && (
        <div className="grid grid-cols-2 gap-3">
          <TrendChart rows={allRows} metricKey="atc_pct" label="ATC %" color="#6366F1" />
          <TrendChart rows={allRows} metricKey="cvr_pct" label="CVR %" color="#10B981" />
          <TrendChart rows={allRows} metricKey="ic_pct" label="IC %" color="#3B82F6" />
          <TrendChart rows={allRows} metricKey="rpp_pct" label="RPP %" color="#F59E0B" />
        </div>
      )}

      {/* DoD / WoW deltas — separate clean table */}
      <div className="bg-bg rounded-md border border-border/50 overflow-hidden">
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-bg">
            <tr className="border-b border-border/50">
              <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1.5 px-3">Metric</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-3">Value</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-3">Day-over-Day</th>
              <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-3">Week-over-Week</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {[
              { label: 'Sessions', val: fmt(sessions), dod: latest.sessions_dod, wow: latest.sessions_wow, sf: '' },
              { label: 'ATC %', val: pct(latest.atc_pct), dod: latest.atc_pct_dod, wow: latest.atc_pct_wow, sf: 'pt' },
              { label: 'IC %', val: pct(latest.ic_pct), dod: latest.ic_pct_dod, wow: latest.ic_pct_wow, sf: 'pt' },
              { label: 'RPP %', val: pct(latest.rpp_pct), dod: latest.rpp_pct_dod, wow: latest.rpp_pct_wow, sf: 'pt' },
              { label: 'CVR %', val: pct(latest.cvr_pct), dod: latest.cvr_pct_dod, wow: latest.cvr_pct_wow, sf: 'pt' },
              { label: 'Orders', val: fmt(latest.orders), dod: latest.orders_dod, wow: latest.orders_wow, sf: '' },
            ].map(m => (
              <tr key={m.label} className="border-b border-border/20 last:border-0">
                <td className="py-1.5 px-3 text-text-secondary">{m.label}</td>
                <td className="py-1.5 px-3 text-right font-medium text-text-primary">{m.val}</td>
                <td className="py-1.5 px-3 text-right"><Delta value={m.dod} suffix={m.sf} /></td>
                <td className="py-1.5 px-3 text-right"><Delta value={m.wow} suffix={m.sf} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Analysis — split into up & down */}
      <div className="rounded-lg border-2 border-border overflow-hidden">
        <div className="bg-bg px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wide">Analysis</span>
          <span className="text-[10px] text-text-muted">Real-time: {analysis.dates.realtime} | IC/RPP: {analysis.dates.historical}</span>
        </div>
        {analysis.up.length === 0 && analysis.down.length === 0 ? (
          <div className="px-3 py-3 text-xs text-text-muted">All metrics stable — no significant movements</div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-positive" />
                <span className="text-[11px] font-bold text-positive uppercase tracking-wide">What's Up</span>
              </div>
              {analysis.up.length === 0 ? (
                <p className="text-[11px] text-text-muted">Nothing significant</p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.up.map((item, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-bold text-text-primary">{item.metric}</span>
                      <span className="text-positive font-semibold"> +{item.delta}{item.suffix}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-negative" />
                <span className="text-[11px] font-bold text-negative uppercase tracking-wide">What's Down</span>
              </div>
              {analysis.down.length === 0 ? (
                <p className="text-[11px] text-text-muted">Nothing significant</p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.down.map((item, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-bold text-text-primary">{item.metric}</span>
                      <span className="text-negative font-semibold"> -{item.delta}{item.suffix}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CroFunnel({ start, end }) {
  const { data, loading, error } = useApi(`/api/analytics/cro-funnel-deltas?start=${start}&end=${end}`);

  const webLatest = pickLatest(data?.web);
  const appLatest = pickLatest(data?.app);

  const visitorDate = webLatest?.date || null;
  const { data: visitorData } = useApi(
    `/api/analytics/visitors?date=${visitorDate}`,
    { skip: !visitorDate }
  );

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">CRO Funnel</h2>
          <p className="text-xs text-text-muted mt-0.5">Conversion funnel — latest complete day</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <p className="text-xs text-negative text-center py-8">{error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="border border-border rounded-lg p-4">
            <ChannelCard title="Web" latest={webLatest} allRows={data?.web} sessionKey="web_sess" visitors={visitorData?.visitors} />
          </div>
          <div className="border border-border rounded-lg p-4">
            <ChannelCard title="App" latest={appLatest} allRows={data?.app} sessionKey="sessions" />
          </div>
        </div>
      )}
    </div>
  );
}
