import { useState } from 'react';
import { useApi } from '../hooks/useApi';

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute z-20 left-0 bottom-full mb-1 px-2.5 py-1.5 text-[11px] text-white bg-gray-900 rounded-md shadow-lg whitespace-nowrap max-w-xs pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

export default function AnomaliesTab({ start }) {
  const { data, loading, error } = useApi(`/api/analytics/anomalies?start=${start}`);
  const allAnomalies = data?.anomalies || [];

  const dates = [...new Set(allAnomalies.map(a => a.date))].sort().reverse();
  const [selectedDate, setSelectedDate] = useState(null);
  const activeDate = selectedDate || dates[0] || null;

  const filtered = activeDate
    ? allAnomalies.filter(a => a.date === activeDate).sort((a, b) => (b.impact || 0) - (a.impact || 0))
    : [];

  const summary = {
    totalDrops: filtered.filter(a => a.type === 'session_drop').length,
    totalSessionLoss: filtered.reduce((s, a) => s + (a.session_delta < 0 ? a.session_delta : 0), 0),
    totalAtcLoss: filtered.reduce((s, a) => s + (a.atc_delta < 0 ? a.atc_delta : 0), 0),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Session Anomalies</h2>
            <p className="text-xs text-text-muted mt-0.5">Pages with significant session drops and ATC changes</p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">
            {allAnomalies.length} total anomalies
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-negative text-center py-8">{error}</p>
        ) : (
          <>
            {/* Date selector */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {dates.slice(0, 14).map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    d === activeDate
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg text-text-secondary border-border hover:border-accent/50'
                  }`}
                >
                  {d.slice(5)}
                </button>
              ))}
            </div>

            {/* Day summary */}
            {activeDate && (
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-bg rounded-md p-3 border border-border/50 text-center">
                  <div className="text-[10px] text-text-muted uppercase">Pages Affected</div>
                  <div className="text-lg font-bold text-text-primary">{summary.totalDrops}</div>
                </div>
                <div className="flex-1 bg-bg rounded-md p-3 border border-border/50 text-center">
                  <div className="text-[10px] text-text-muted uppercase">Sessions Lost</div>
                  <div className="text-lg font-bold text-negative">{summary.totalSessionLoss.toLocaleString()}</div>
                </div>
                <div className="flex-1 bg-bg rounded-md p-3 border border-border/50 text-center">
                  <div className="text-[10px] text-text-muted uppercase">ATC Lost</div>
                  <div className="text-lg font-bold text-negative">{summary.totalAtcLoss.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Table */}
            {filtered.length === 0 ? (
              <p className="text-xs text-positive text-center py-8">No anomalies for this date</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-[2] bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Page</th>
                      <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Type</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Session Δ</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">ATC Δ</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Yesterday</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">7d Avg</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Trend</th>
                      <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a, i) => {
                      const trendPct = a.trend != null ? (a.trend * 100) : null;
                      const avg7d = a.last_7d_sessions != null ? Math.round(a.last_7d_sessions / 7) : null;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                          <td className="py-3 px-3 text-sm max-w-[220px]">
                            <Tooltip text={a.page}>
                              <span className="block truncate text-text-secondary cursor-default">{a.page}</span>
                            </Tooltip>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              a.type === 'session_drop' ? 'bg-negative/10 text-negative'
                                : a.type === 'mixed' ? 'bg-warning/10 text-warning'
                                : 'bg-accent/10 text-accent'
                            }`}>
                              {a.type === 'session_drop' ? 'Drop' : a.type}
                            </span>
                          </td>
                          <td className={`py-3 px-3 text-sm text-right font-medium ${a.session_delta < 0 ? 'text-negative' : 'text-positive'}`}>
                            {a.session_delta != null ? a.session_delta.toLocaleString() : '—'}
                          </td>
                          <td className={`py-3 px-3 text-sm text-right font-medium ${a.atc_delta < 0 ? 'text-negative' : a.atc_delta > 0 ? 'text-positive' : 'text-text-muted'}`}>
                            {a.atc_delta != null ? a.atc_delta.toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-3 text-sm text-right text-text-secondary">
                            {a.yesterday_sessions != null ? a.yesterday_sessions.toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-3 text-sm text-right text-text-secondary">
                            {avg7d != null ? avg7d.toLocaleString() : '—'}
                          </td>
                          <td className={`py-3 px-3 text-sm text-right font-medium ${trendPct != null && trendPct < -10 ? 'text-negative' : trendPct != null && trendPct > 10 ? 'text-positive' : 'text-text-secondary'}`}>
                            {trendPct != null ? `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(0)}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-sm text-right font-semibold text-text-primary">
                            {a.impact != null ? a.impact.toFixed(0) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
