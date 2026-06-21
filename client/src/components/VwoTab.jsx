const CAMPAIGNS = [
  { id: 70, name: 'EMI A/B', status: 'RUNNING', started: '2026-06-16', goal: 'Shopify Purchase Revenue', type: 'revenue', visitors: 23455, control: { conv: 295, visitors: 11676, rate: null, rpv: 94.75 }, variation: { conv: 280, visitors: 11779, rate: null, rpv: 92.20 }, improvement: -2.69, confidence: 47.95 },
  { id: 67, name: 'Product Card A/B', status: 'RUNNING', started: '2026-06-16', goal: 'ATC on Product Card', type: 'conversion', visitors: 25815, control: { conv: 434, visitors: 12945, rate: 3.35 }, variation: { conv: 464, visitors: 12870, rate: 3.57 }, improvement: 6.67, confidence: 57.47 },
  { id: 66, name: 'Product Title A/B', status: 'PAUSED', started: '2026-06-08', goal: 'Shopify Purchase Revenue', type: 'revenue', visitors: 31935, control: { conv: 225, visitors: 10642, rate: null, rpv: 77.84 }, variation: { conv: 246, visitors: 10678, rate: null, rpv: 85.62 }, improvement: 9.99, confidence: 54.80, variations: 3 },
  { id: 65, name: 'Cart Progress Bar', status: 'PAUSED', started: '2026-06-01', goal: 'Shopify Purchase Revenue', type: 'revenue', visitors: 119517, control: { conv: 1290, visitors: 59570, rate: null, rpv: 49.89 }, variation: { conv: 1323, visitors: 59947, rate: null, rpv: 52.39 }, improvement: 5.02, confidence: 60.55 },
  { id: 64, name: 'Announcement Bar', status: 'PAUSED', started: '2026-05-27', goal: 'Shopify Purchase Revenue', type: 'revenue', visitors: 89471, control: { conv: 1127, visitors: 44648, rate: null, rpv: 61.55 }, variation: { conv: 1125, visitors: 44823, rate: null, rpv: 57.31 }, improvement: -6.89, confidence: 33.83 },
  { id: 63, name: 'Cart Bill Summary + Progress Bar', status: 'PAUSED', started: '2026-05-29', goal: 'Cart drawer checkout', type: 'conversion', visitors: 63003, control: { conv: 2907, visitors: 31546, rate: 9.22 }, variation: { conv: 2666, visitors: 31457, rate: 8.48 }, improvement: -8.03, confidence: 0.97 },
  { id: 61, name: 'Trustification Section', status: 'PAUSED', started: '2026-05-08', goal: 'Shopify_Purchase', type: 'conversion', visitors: 36290, control: { conv: 553, visitors: 18070, rate: 3.06 }, variation: { conv: 593, visitors: 18220, rate: 3.25 }, improvement: 6.35, confidence: 59.50 },
  { id: 60, name: 'Crazy Deals 2.0 (999)', status: 'PAUSED', started: '2026-04-30', goal: 'Shopify_Purchase', type: 'conversion', visitors: 2670, control: { conv: 101, visitors: 1388, rate: 7.28 }, variation: { conv: 86, visitors: 1282, rate: 6.71 }, improvement: -7.81, confidence: 47.08 },
  { id: 59, name: 'Crazy Deals 2.0', status: 'PAUSED', started: '2026-04-23', goal: 'Shopify_Purchase', type: 'conversion', visitors: 5271, control: { conv: 219, visitors: 2584, rate: 8.48 }, variation: { conv: 231, visitors: 2687, rate: 8.60 }, improvement: 1.44, confidence: 50.34 },
  { id: 54, name: 'Variant Selector Popup', status: 'PAUSED', started: '2026-04-17', goal: 'Shopify Purchase', type: 'conversion', visitors: 46106, control: { conv: 572, visitors: 22988, rate: 2.49 }, variation: { conv: 618, visitors: 23118, rate: 2.67 }, improvement: 7.43, confidence: 61.63 },
  { id: 53, name: 'Hydra Rush Landing Page', status: 'PAUSED', started: '2026-04-23', goal: 'Shopify Purchase', type: 'conversion', visitors: 951, control: { conv: 32, visitors: 476, rate: 6.72 }, variation: { conv: 21, visitors: 475, rate: 4.42 }, improvement: -34.23, confidence: 0 },
  { id: 51, name: 'Sticky ATC with Buy Now', status: 'PAUSED', started: '2026-04-09', goal: 'Shopify Purchase', type: 'conversion', visitors: 25396, control: { conv: 385, visitors: 12876, rate: 2.99 }, variation: { conv: 350, visitors: 12520, rate: 2.80 }, improvement: -6.51, confidence: 40.69 },
  { id: 50, name: 'PDP Page New UI', status: 'PAUSED', started: '2026-03-13', goal: 'Shopify Purchase', type: 'conversion', visitors: 53920, control: { conv: 598, visitors: 26611, rate: 2.25 }, variation: { conv: 605, visitors: 27309, rate: 2.22 }, improvement: -1.42, confidence: 45.22 },
  { id: 49, name: 'GNC Cash PDP (Cloned)', status: 'PAUSED', started: '2026-02-18', goal: 'Shopify Purchase', type: 'conversion', visitors: 142266, control: { conv: 1574, visitors: 71190, rate: 2.21 }, variation: { conv: 1664, visitors: 71076, rate: 2.34 }, improvement: 5.89, confidence: 73.10 },
  { id: 47, name: 'GNC Cash PDP', status: 'PAUSED', started: '2026-02-16', goal: 'Shopify Purchase', type: 'conversion', visitors: 35551, control: { conv: 411, visitors: 17773, rate: 2.31 }, variation: { conv: 398, visitors: 17778, rate: 2.24 }, improvement: -3.19, confidence: 44.38 },
];

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
      status === 'RUNNING' ? 'bg-positive/10 text-positive' : 'bg-border text-text-muted'
    }`}>
      {status}
    </span>
  );
}

function ResultBadge({ improvement, confidence }) {
  if (improvement == null) return <span className="text-text-muted">—</span>;
  const pos = improvement > 0;
  const significant = confidence >= 95;
  const color = significant
    ? (pos ? 'text-positive' : 'text-negative')
    : (pos ? 'text-positive' : 'text-negative');

  return (
    <div className="text-right">
      <div className={`text-sm font-semibold ${color}`}>
        {pos ? '+' : ''}{improvement.toFixed(1)}%
      </div>
      <div className="text-[10px] text-text-muted">{confidence.toFixed(0)}% conf.</div>
    </div>
  );
}

export default function VwoTab() {
  const running = CAMPAIGNS.filter(c => c.status === 'RUNNING');
  const paused = CAMPAIGNS.filter(c => c.status === 'PAUSED');
  const winners = CAMPAIGNS.filter(c => c.improvement > 0 && c.confidence >= 70);
  const losers = CAMPAIGNS.filter(c => c.improvement < 0 && c.confidence >= 70);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">VWO AB Tests</h2>
            <p className="text-xs text-text-muted mt-0.5">All campaigns since Feb 13, 2026 — GNC India (guardian.in)</p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
            {CAMPAIGNS.length} tests
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted uppercase">Running</div>
            <div className="text-xl font-bold text-positive">{running.length}</div>
          </div>
          <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted uppercase">Paused</div>
            <div className="text-xl font-bold text-text-primary">{paused.length}</div>
          </div>
          <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted uppercase">Positive Lift</div>
            <div className="text-xl font-bold text-positive">{winners.length}</div>
          </div>
          <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
            <div className="text-[10px] text-text-muted uppercase">Negative</div>
            <div className="text-xl font-bold text-negative">{losers.length}</div>
          </div>
        </div>

        <div className="text-xs text-text-muted">
          Total visitors across all tests: {CAMPAIGNS.reduce((s, c) => s + c.visitors, 0).toLocaleString()}
        </div>
      </div>

      {/* Running Tests */}
      {running.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Currently Running</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-positive/15 text-positive">{running.length} live</span>
          </div>
          <div className="flex flex-col gap-3">
            {running.map(c => (
              <CampaignCard key={c.id} campaign={c} expanded />
            ))}
          </div>
        </div>
      )}

      {/* All Tests Table */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">All Campaigns</h2>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">{CAMPAIGNS.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Campaign</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Status</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Started</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Primary Goal</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Visitors</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Control</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Variation</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Lift</th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-3 px-3 text-sm font-medium text-text-primary max-w-[200px] truncate">{c.name}</td>
                  <td className="py-3 px-3"><StatusBadge status={c.status} /></td>
                  <td className="py-3 px-3 text-xs text-text-muted">{c.started}</td>
                  <td className="py-3 px-3 text-xs text-text-secondary max-w-[160px] truncate">{c.goal}</td>
                  <td className="py-3 px-3 text-sm text-right text-text-secondary">{c.visitors.toLocaleString()}</td>
                  <td className="py-3 px-3 text-sm text-right text-text-secondary">
                    {c.type === 'revenue' ? `₹${c.control.rpv?.toFixed(0)}/v` : `${c.control.rate}%`}
                  </td>
                  <td className="py-3 px-3 text-sm text-right text-text-secondary">
                    {c.type === 'revenue' ? `₹${c.variation.rpv?.toFixed(0)}/v` : `${c.variation.rate}%`}
                  </td>
                  <td className="py-3 px-3"><ResultBadge improvement={c.improvement} confidence={c.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign: c, expanded }) {
  const pos = c.improvement > 0;
  return (
    <div className="bg-bg rounded-md p-4 border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{c.name}</h3>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">Goal: {c.goal} · Started {c.started}</p>
        </div>
        <ResultBadge improvement={c.improvement} confidence={c.confidence} />
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-md p-3 border border-border/50">
            <div className="text-[10px] text-text-muted uppercase mb-1">Control</div>
            <div className="text-lg font-bold text-text-primary">
              {c.type === 'revenue' ? `₹${c.control.rpv?.toFixed(2)}/visitor` : `${c.control.rate}%`}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {c.control.conv.toLocaleString()} / {c.control.visitors.toLocaleString()} visitors
            </div>
          </div>
          <div className={`bg-card rounded-md p-3 border ${pos ? 'border-positive/30' : 'border-negative/30'}`}>
            <div className="text-[10px] text-text-muted uppercase mb-1">Variation 1</div>
            <div className={`text-lg font-bold ${pos ? 'text-positive' : 'text-negative'}`}>
              {c.type === 'revenue' ? `₹${c.variation.rpv?.toFixed(2)}/visitor` : `${c.variation.rate}%`}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {c.variation.conv.toLocaleString()} / {c.variation.visitors.toLocaleString()} visitors
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
