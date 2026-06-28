import { useState, useCallback } from 'react';
import CroDashboard from './components/CroDashboard';
import WebVitalsTab from './components/WebVitalsTab';
import ProductsTab from './components/ProductsTab';
import AnomaliesTab from './components/AnomaliesTab';
import AbTestsTab from './components/AbTestsTab';
import VwoTab from './components/VwoTab';
import MetaTab from './components/MetaTab';
import GaAppTab from './components/GaAppTab';
import GaWebTab from './components/GaWebTab';
import GokwikTab from './components/GokwikTab';
import GoogleAdsTab from './components/GoogleAdsTab';
import SummaryTab from './components/SummaryTab';
import SyncStatus from './components/SyncStatus';
import HomePage from './components/HomePage';
import ChatWidget from './components/ChatWidget';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'cro', label: 'CRO' },
  { id: 'gokwik', label: 'GoKwik' },
  { id: 'ga-app', label: 'GA - App' },
  { id: 'ga-web', label: 'GA - Web' },
  { id: 'vitals', label: 'Web Vitals' },
  { id: 'products', label: 'Products' },
  { id: 'google-ads', label: 'Google Ads' },
  { id: 'meta', label: 'Meta Ads' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'abtests', label: 'AB Tests' },
  { id: 'vwo', label: 'VWO' },
];

function getDefaultDates() {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

export default function App() {
  const defaults = getDefaultDates();
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [tab, setTab] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSyncComplete = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleNavigate = useCallback((tabId) => {
    setTab(tabId);
  }, []);

  if (tab === null) {
    return <>
      <HomePage onNavigate={handleNavigate} />
      <ChatWidget />
    </>;
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 bg-card/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab(null)}
              className="text-lg font-semibold text-text-primary hover:text-accent transition-colors"
              title="Back to home"
            >
              GNC Smart Layer
            </button>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-positive/15 text-positive uppercase tracking-wide">Live</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
              <span className="text-xs text-text-muted">to</span>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
            </div>
            <SyncStatus onSyncComplete={handleSyncComplete} />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4" key={refreshKey}>
        {tab === 'summary' && <SummaryTab onNavigate={handleNavigate} />}
        {tab === 'cro' && <CroDashboard start={start} end={end} />}
        {tab === 'ga-app' && <GaAppTab start={start} end={end} />}
        {tab === 'ga-web' && <GaWebTab start={start} end={end} />}
        {tab === 'vitals' && <WebVitalsTab start={start} end={end} />}
        {tab === 'products' && <ProductsTab start={start} end={end} />}
        {tab === 'google-ads' && <GoogleAdsTab />}
        {tab === 'meta' && <MetaTab />}
        {tab === 'anomalies' && <AnomaliesTab start={start} />}
        {tab === 'abtests' && <AbTestsTab start={start} end={end} />}
        {tab === 'vwo' && <VwoTab />}
        {tab === 'gokwik' && <GokwikTab />}
      </main>
      <ChatWidget />
    </div>
  );
}
