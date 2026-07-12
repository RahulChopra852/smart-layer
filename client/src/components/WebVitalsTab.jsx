import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import WebVitals from './WebVitals';
import SectionNav from './SectionNav';

const VITALS_SECTIONS = [
  { id: 'vitals-psi-summary', label: 'PSI Daily Summary' },
  { id: 'vitals-web-vitals', label: 'Web Vitals' },
];

function pf(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function lcpColor(v) { return v > 4 ? 'text-negative' : v > 2.5 ? 'text-warning' : 'text-positive'; }
function perfColor(v) { return v < 50 ? 'text-negative' : v < 90 ? 'text-warning' : 'text-positive'; }

function PsiDailySummary() {
  const { data, loading, error } = useApi('/api/analytics/psi-daily');
  const entries = data?.entries || [];

  const byDate = {};
  for (const e of entries) {
    if (!e.date) continue;
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const dates = Object.keys(byDate).sort().reverse();
  const [selectedDate, setSelectedDate] = useState(null);
  const activeDate = selectedDate || dates[0];
  const pages = byDate[activeDate] || [];

  if (loading) return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
        <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading PSI data...
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-negative text-center py-8">{error}</p>
    </div>
  );

  if (entries.length === 0) return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-2">PSI Daily Report</h2>
      <p className="text-xs text-text-muted text-center py-6">No PSI email data yet — runs daily at 6 PM via Apps Script</p>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">PSI Daily Report</h2>
          <p className="text-xs text-text-muted mt-0.5">From automated email — {pages.length} pages tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {dates.slice(0, 7).map(d => (
              <button key={d} onClick={() => setSelectedDate(d)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  d === activeDate ? 'bg-accent text-white border-accent' : 'bg-bg text-text-secondary border-border hover:border-accent/50'
                }`}>
                {d.slice(5)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {pages.map((p, i) => {
          const lcp = pf(p.lcp);
          const fcp = pf(p.fcp);
          const perf = pf(p.performance);
          const si = pf(p.speed_index);
          const lcpAvg = pf(p.lcp_avg3d);
          const perfAvg = pf(p.perf_avg3d);
          const alerts = (p.alerts || '').split(',').map(s => s.trim()).filter(Boolean);
          const hasAlerts = alerts.length > 0;

          return (
            <div key={i} className={`bg-bg rounded-lg p-4 border ${hasAlerts ? 'border-negative/30' : 'border-border/50'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-primary truncate max-w-[200px]" title={p.page}>{p.page}</span>
                {hasAlerts && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">
                    {alerts.length} alerts
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <div className="text-[10px] text-text-muted uppercase">LCP</div>
                  <div className={`text-sm font-bold ${lcpColor(lcp)}`}>{lcp != null ? lcp + 's' : '—'}</div>
                  {lcpAvg != null && <div className="text-[10px] text-text-muted">avg {lcpAvg}s</div>}
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase">FCP</div>
                  <div className={`text-sm font-bold ${fcp > 3 ? 'text-negative' : fcp > 1.8 ? 'text-warning' : 'text-positive'}`}>{fcp != null ? fcp + 's' : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase">Speed Idx</div>
                  <div className={`text-sm font-bold ${si > 4.3 ? 'text-negative' : si > 3.4 ? 'text-warning' : 'text-positive'}`}>{si != null ? si + 's' : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase">Perf</div>
                  <div className={`text-sm font-bold ${perfColor(perf)}`}>{perf != null ? perf : '—'}</div>
                  {perfAvg != null && <div className="text-[10px] text-text-muted">avg {perfAvg}</div>}
                </div>
              </div>
              {hasAlerts && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {alerts.map(a => (
                    <span key={a} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-negative/10 text-negative">{a}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WebVitalsTab({ start, end }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={VITALS_SECTIONS} />
      <div id="vitals-psi-summary"><PsiDailySummary /></div>
      <div id="vitals-web-vitals"><WebVitals start={start} end={end} /></div>
    </div>
  );
}
