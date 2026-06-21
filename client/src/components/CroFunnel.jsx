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

function StepBar({ label, value, maxVal }) {
  const w = maxVal > 0 ? Math.min((value || 0) / maxVal * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[11px] text-text-muted w-8 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-border/60 rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out" style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-semibold text-text-primary w-14 text-right">{fmt(value)}</span>
    </div>
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

function generateAnalysis(d) {
  if (!d || d.sessions == null) return [];
  const lines = [];

  if (d.sessions_dod != null) {
    const base = d.sessions - d.sessions_dod;
    if (base > 0) {
      const pctChange = (d.sessions_dod / base) * 100;
      if (Math.abs(pctChange) > 3) {
        lines.push(`Sessions ${pctChange > 0 ? 'up' : 'down'} ${Math.abs(pctChange).toFixed(0)}% day-over-day`);
      }
    }
  }

  if (d.atc_pct_dod != null && Math.abs(d.atc_pct_dod) >= 0.3)
    lines.push(`ATC rate ${d.atc_pct_dod > 0 ? 'improved' : 'dropped'} ${Math.abs(d.atc_pct_dod).toFixed(2)}pt DoD — ${d.atc_pct_dod > 0 ? 'more visitors adding to cart' : 'potential friction in product pages'}`);
  if (d.ic_pct_dod != null && Math.abs(d.ic_pct_dod) >= 0.3)
    lines.push(`Initiate Checkout ${d.ic_pct_dod > 0 ? 'up' : 'down'} ${Math.abs(d.ic_pct_dod).toFixed(2)}pt DoD — ${d.ic_pct_dod < 0 ? 'cart-to-checkout drop-off increasing' : 'checkout intent improving'}`);
  if (d.rpp_pct_dod != null && Math.abs(d.rpp_pct_dod) >= 0.3)
    lines.push(`Reached Payment ${d.rpp_pct_dod > 0 ? 'up' : 'down'} ${Math.abs(d.rpp_pct_dod).toFixed(2)}pt DoD — ${d.rpp_pct_dod < 0 ? 'checkout form friction or payment issues' : 'smoother checkout flow'}`);

  if (d.atc_pct_wow != null && Math.abs(d.atc_pct_wow) >= 0.5)
    lines.push(`ATC rate ${d.atc_pct_wow > 0 ? 'up' : 'down'} ${Math.abs(d.atc_pct_wow).toFixed(2)}pt vs same day last week`);
  if (d.cvr_pct_wow != null && Math.abs(d.cvr_pct_wow) >= 0.3)
    lines.push(`Overall CVR ${d.cvr_pct_wow > 0 ? 'improved' : 'declined'} ${Math.abs(d.cvr_pct_wow).toFixed(2)}pt week-over-week`);
  if (d.orders_wow != null && d.orders != null) {
    const base = d.orders - d.orders_wow;
    if (base > 0) {
      const wowPct = (d.orders_wow / base) * 100;
      if (Math.abs(wowPct) > 10)
        lines.push(`Orders ${wowPct > 0 ? 'up' : 'down'} ${Math.abs(wowPct).toFixed(0)}% vs last week`);
    }
  }

  if (lines.length === 0) lines.push('Metrics stable — no significant DoD or WoW movements');
  return lines;
}

function ChannelCard({ title, latest, sessionKey, visitors }) {
  if (!latest) return <p className="text-xs text-text-muted py-4">No data available</p>;

  const sessions = latest[sessionKey] ?? latest.sessions;
  if (sessions == null || sessions === 0) return <p className="text-xs text-text-muted py-4">No session data</p>;

  const analysis = generateAnalysis(latest);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="text-[10px] text-text-muted">{latest.date}</span>
      </div>

      {/* Sessions + Visitors */}
      <div className="bg-bg rounded-md p-3 mb-3 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-text-muted uppercase tracking-wide mb-0.5">Sessions</div>
            <div className="text-xl font-bold text-text-primary">{fmt(sessions)}</div>
            {visitors != null && (
              <div className="text-[11px] text-text-muted mt-0.5">{fmt(visitors)} unique visitors</div>
            )}
          </div>
          <div className="text-right space-y-0.5">
            {latest.sessions_dod != null && <div className="text-[11px] text-text-muted">DoD <Delta value={latest.sessions_dod} suffix="" /></div>}
            {latest.sessions_wow != null && <div className="text-[11px] text-text-muted">WoW <Delta value={latest.sessions_wow} suffix="" /></div>}
          </div>
        </div>
      </div>

      {/* Funnel bars */}
      <div className="mb-3">
        <StepBar label="ATC" value={latest.atc} maxVal={sessions} />
        <StepBar label="IC" value={latest.ic} maxVal={sessions} />
        <StepBar label="RPP" value={latest.rpp} maxVal={sessions} />
        <StepBar label="Ord" value={latest.orders} maxVal={sessions} />
      </div>

      {/* Rates table */}
      <table className="w-full mb-3">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1">Metric</th>
            <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1">Rate</th>
            <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1">DoD</th>
            <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1">WoW</th>
          </tr>
        </thead>
        <tbody className="text-xs">
          {[
            { label: 'ATC %', val: latest.atc_pct, dod: latest.atc_pct_dod, wow: latest.atc_pct_wow },
            { label: 'IC %', val: latest.ic_pct, dod: latest.ic_pct_dod, wow: latest.ic_pct_wow },
            { label: 'RPP %', val: latest.rpp_pct, dod: latest.rpp_pct_dod, wow: latest.rpp_pct_wow },
            { label: 'CVR %', val: latest.cvr_pct, dod: latest.cvr_pct_dod, wow: latest.cvr_pct_wow },
          ].map(m => (
            <tr key={m.label} className="border-b border-border/30">
              <td className="py-1.5 text-text-secondary">{m.label}</td>
              <td className="py-1.5 text-right font-medium text-text-primary">{pct(m.val)}</td>
              <td className="py-1.5 text-right"><Delta value={m.dod} /></td>
              <td className="py-1.5 text-right"><Delta value={m.wow} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Step ratios */}
      {(latest.atc_to_ci > 0 || latest.ci_to_rpp > 0 || latest.rpp_to_ord > 0) && (
        <div className="flex gap-2 mb-3">
          {[{ l: 'ATC→CI', v: latest.atc_to_ci }, { l: 'CI→RPP', v: latest.ci_to_rpp }, { l: 'RPP→Ord', v: latest.rpp_to_ord }]
            .filter(s => s.v != null && s.v > 0)
            .map(s => (
              <div key={s.l} className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted">{s.l}</div>
                <div className="text-xs font-semibold text-text-primary">{pct(s.v)}</div>
              </div>
            ))}
        </div>
      )}

      {/* Orders */}
      {latest.orders != null && latest.orders > 0 && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted">Orders</div>
            <div className="text-sm font-bold text-text-primary">{fmt(latest.orders)}</div>
          </div>
          {latest.web_orders != null && latest.web_orders > 0 && (
            <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
              <div className="text-[10px] text-text-muted">Web</div>
              <div className="text-sm font-bold text-text-primary">{fmt(latest.web_orders)}</div>
            </div>
          )}
          {latest.app_orders != null && latest.app_orders > 0 && (
            <div className="flex-1 bg-bg rounded-md p-2 border border-border/50 text-center">
              <div className="text-[10px] text-text-muted">App</div>
              <div className="text-sm font-bold text-text-primary">{fmt(latest.app_orders)}</div>
            </div>
          )}
        </div>
      )}

      {/* Analysis */}
      <div className="bg-accent/5 border border-accent/15 rounded-md p-3 mt-auto">
        <div className="text-[10px] font-medium text-accent uppercase tracking-wide mb-1.5">Analysis</div>
        <ul className="space-y-1">
          {analysis.map((line, i) => (
            <li key={i} className="text-xs text-text-secondary leading-relaxed">• {line}</li>
          ))}
        </ul>
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
        <div className="flex gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">DoD</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-positive/15 text-positive">WoW</span>
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
          <ChannelCard title="Web" latest={webLatest} sessionKey="web_sess" visitors={visitorData?.visitors} />
          <ChannelCard title="App" latest={appLatest} sessionKey="sessions" />
        </div>
      )}
    </div>
  );
}
