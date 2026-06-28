import { useApi } from '../hooks/useApi';

const fmt = (v) => v == null ? '—' : Math.round(v).toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(parseFloat(v)).toLocaleString()}`;

function fmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === '₹') return fmtCur(v);
  if (unit === 'x') return `${parseFloat(v).toFixed(1)}x`;
  if (unit === '%') return `${parseFloat(v).toFixed(2)}%`;
  return fmt(v);
}

function SignalRow({ s }) {
  const isUp = s.change > 0;
  const isBig = Math.abs(s.change) > 15;
  const goodUp = s.metric !== 'Ad Spend';
  const isGood = goodUp ? isUp : !isUp;

  return (
    <div className={`p-2.5 rounded-md border ${isBig ? (isGood ? 'border-positive/30 bg-positive/5' : 'border-negative/30 bg-negative/5') : 'border-border/50 bg-bg'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-base ${isGood ? 'text-positive' : 'text-negative'}`}>{isUp ? '↑' : '↓'}</span>
          <span className="text-sm font-medium text-text-primary">{s.metric}</span>
        </div>
        <span className={`text-xs font-semibold ${isGood ? 'text-positive' : 'text-negative'}`}>
          {isUp ? '+' : ''}{s.change.toFixed(1)}% vs pace
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="text-text-muted">Now</div>
          <div className="font-semibold text-text-primary">{fmtVal(s.actual, s.unit)}</div>
        </div>
        {!s.isRate && (
          <div>
            <div className="text-text-muted">Projected</div>
            <div className="font-semibold text-accent">{fmtVal(s.projected, s.unit)}</div>
          </div>
        )}
        <div>
          <div className="text-text-muted">{s.isRate ? 'Yesterday' : 'Y\'day same hr'}</div>
          <div className="font-semibold text-text-secondary">{fmtVal(s.isRate ? s.yesterdayFull : s.yesterdayAtHour, s.unit)}</div>
        </div>
        {!s.isRate && (
          <div className="col-span-3 pt-1 border-t border-border/30">
            <span className="text-text-muted">Yesterday full day: </span>
            <span className="font-semibold text-text-secondary">{fmtVal(s.yesterdayFull, s.unit)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalSection({ title, signals }) {
  if (!signals || !signals.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{title}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {signals.map(s => (
          <SignalRow key={s.metric} s={s} />
        ))}
      </div>
    </div>
  );
}

export default function RcaSnapshot() {
  const { data, loading, error } = useApi('/api/analytics/rca-snapshot');

  if (loading) return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-center py-6 text-xs text-text-muted gap-2">
        <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading RCA...
      </div>
    </div>
  );
  if (error || !data) return null;

  const { webSignals, appSignals, otherSignals, affectedPages, date, hoursElapsed, problems } = data;
  const allSignals = [...(webSignals || []), ...(appSignals || []), ...(otherSignals || [])];
  const up = allSignals.filter(s => s.metric === 'Ad Spend' ? s.change < 0 : s.change > 0);
  const down = allSignals.filter(s => s.metric === 'Ad Spend' ? s.change > 0 : s.change < 0);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Today's RCA</h2>
          <p className="text-xs text-text-muted mt-0.5">
            {date} · {hoursElapsed}h elapsed · comparing at same hour pace vs yesterday
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-positive/15 text-positive">{up.length} ahead</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">{down.length} behind</span>
        </div>
      </div>

      {allSignals.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-6">No data available for today yet</p>
      ) : (
        <div className="flex flex-col gap-4">
          <SignalSection title="Web (CRO + Shopify)" signals={webSignals} />
          <SignalSection title="App (Google Analytics)" signals={appSignals} />
          {(otherSignals || []).length > 0 && <SignalSection title="Other Sources" signals={otherSignals} />}
        </div>
      )}

      {affectedPages && affectedPages.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-text-primary mb-2">Pages with significant session change (pace-adjusted)</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Page</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Now</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Y'day@hr</th>
                  <th className="text-right text-[10px] font-medium text-text-muted uppercase py-1.5 px-2">Pace</th>
                </tr>
              </thead>
              <tbody>
                {affectedPages.map(p => (
                  <tr key={p.page} className="border-b border-border/30 hover:bg-bg transition-colors">
                    <td className="py-1.5 px-2 text-xs text-text-primary max-w-[250px] truncate" title={p.page}>{p.page}</td>
                    <td className="py-1.5 px-2 text-xs text-right text-text-secondary">{fmt(p.today)}</td>
                    <td className="py-1.5 px-2 text-xs text-right text-text-secondary">{fmt(p.yesterdayAtHour)}</td>
                    <td className={`py-1.5 px-2 text-xs text-right font-semibold ${p.change > 0 ? 'text-positive' : 'text-negative'}`}>
                      {p.change > 0 ? '+' : ''}{p.change.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function useRcaProblems() {
  const { data } = useApi('/api/analytics/rca-snapshot');
  return data?.problems || [];
}
