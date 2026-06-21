import { useApi } from '../hooks/useApi';

export default function RcaNotes({ start, end }) {
  const { data, loading, error } = useApi(`/api/rca/notes?start=${start}&end=${end}`);
  const notes = (data?.notes || []).slice().reverse();

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">RCA Notes</h2>
          <p className="text-xs text-text-muted mt-0.5">Root cause annotations and observations</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
          {notes.length} notes
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <p className="text-xs text-negative text-center py-8">{error}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">No RCA notes for this period</p>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {notes.map((n, i) => (
            <div key={n.id || i} className="flex gap-3 p-3 bg-bg rounded-md border border-border/50">
              <span className="text-xs font-semibold text-accent whitespace-nowrap min-w-[72px]">{n.date}</span>
              <div className="min-w-0">
                <p className="text-sm text-text-secondary leading-relaxed">{n.note}</p>
                <p className="text-[10px] text-text-muted mt-1">
                  <span className="inline-block bg-border/60 px-1.5 py-0.5 rounded text-text-muted">{n.source}</span>
                  {' '}{n.metric_tag}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
