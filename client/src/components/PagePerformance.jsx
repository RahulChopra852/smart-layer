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

export default function PagePerformance({ start, end, mode = 'top' }) {
  const { data, loading, error } = useApi(`/api/analytics/page-performance?start=${start}&end=${end}`);
  const allPages = data?.pages || [];

  const isTop = mode === 'top';
  const pages = isTop
    ? allPages.slice(0, 10)
    : allPages.filter(p => p.sessions >= 500).sort((a, b) => a.atc_rate - b.atc_rate).slice(0, 10);

  const title = isTop ? 'Top Pages' : 'Needs Attention';
  const subtitle = isTop ? 'Highest traffic landing pages' : 'High sessions (500+), lowest ATC%';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isTop ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'}`}>
          {pages.length} {isTop ? 'pages' : 'flagged'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <p className="text-xs text-negative text-center py-8">{error}</p>
      ) : pages.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">
          {isTop ? 'No page data for this range' : 'No underperforming pages found'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Landing Page</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">ATC</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">ATC %</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Top Source</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, i) => {
                const topSource = p.bySource?.[0];
                const atcPct = p.atc_rate * 100;
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-3 px-3 text-sm max-w-[240px]">
                      <Tooltip text={p.landing_page}>
                        <span className="block truncate text-text-secondary cursor-default">{p.landing_page}</span>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-3 text-sm text-text-secondary">{p.sessions?.toLocaleString()}</td>
                    <td className="py-3 px-3 text-sm text-text-secondary">{p.atc_count?.toLocaleString()}</td>
                    <td className={`py-3 px-3 text-sm font-medium ${atcPct > 10 ? 'text-positive' : atcPct < 5 ? 'text-negative' : 'text-text-secondary'}`}>
                      {atcPct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-sm text-text-secondary">
                      {topSource ? (
                        <Tooltip text={`${topSource.sessions?.toLocaleString()} sessions, ${(topSource.atc_rate * 100).toFixed(1)}% ATC`}>
                          <span className="cursor-default">{topSource.source}</span>
                        </Tooltip>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
