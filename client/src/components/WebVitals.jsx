import { useApi } from '../hooks/useApi';

export default function WebVitals({ start, end }) {
  const { data, loading, error } = useApi(`/api/analytics/web-vitals-flags?start=${start}&end=${end}`);

  const latestByPage = {};
  (data?.flagged || []).forEach(item => {
    if (!latestByPage[item.url] || item.run_at > latestByPage[item.url].run_at) {
      latestByPage[item.url] = item;
    }
  });
  const pages = Object.values(latestByPage).slice(0, 10);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Web Vitals Flags</h2>
          <p className="text-xs text-text-muted mt-0.5">Pages exceeding performance thresholds</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">
          {pages.length} flagged
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
        <p className="text-xs text-positive text-center py-8">No flagged pages — all clear</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Page</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">LCP</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">INP</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">CLS</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-3 px-3 text-sm text-text-secondary max-w-[200px] truncate" title={p.page_title}>
                    {p.page_title}
                  </td>
                  <td className={`py-3 px-3 text-sm font-medium ${parseFloat(p.lcp) > 2.5 ? 'text-negative' : 'text-text-secondary'}`}>
                    {p.lcp}s
                  </td>
                  <td className={`py-3 px-3 text-sm font-medium ${parseFloat(p.inp) > 200 ? 'text-negative' : 'text-text-secondary'}`}>
                    {p.inp}ms
                  </td>
                  <td className={`py-3 px-3 text-sm font-medium ${parseFloat(p.cls) > 0.1 ? 'text-warning' : 'text-text-secondary'}`}>
                    {p.cls}
                  </td>
                  <td className="py-3 px-3">
                    {p.flags?.map(f => (
                      <span
                        key={f}
                        className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mr-1
                          ${f === 'LCP' ? 'bg-negative/15 text-negative' : ''}
                          ${f === 'INP' ? 'bg-negative/15 text-negative' : ''}
                          ${f === 'CLS' ? 'bg-warning/15 text-warning' : ''}
                        `}
                      >
                        {f}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
