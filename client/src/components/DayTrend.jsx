import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { SingleDatePicker } from './DateRangePicker';

const fmt = (v) => v == null ? '—' : Math.round(v).toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;

function Delta({ curr, prev }) {
  if (prev == null || prev === 0 || curr == null) return null;
  const d = ((curr - prev) / prev * 100).toFixed(1);
  const pos = parseFloat(d) >= 0;
  return <span className={`text-[10px] font-medium ml-1 ${pos ? 'text-positive' : 'text-negative'}`}>{pos ? '+' : ''}{d}%</span>;
}

export default function DayTrend() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, error } = useApi(`/api/analytics/day-trend?date=${selectedDate}`);

  if (loading) return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-center py-6 text-xs text-text-muted gap-2">
        <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading trend...
      </div>
    </div>
  );
  if (error || !data) return null;

  const { selected, previous, sameDayHistory, dayName } = data;
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{dayName} Trend</h2>
          <p className="text-xs text-text-muted mt-0.5">{isToday ? 'Today' : selected.date} vs previous day vs last {sameDayHistory.length} {dayName}s</p>
        </div>
        <SingleDatePicker value={selectedDate} onChange={setSelectedDate} max={new Date().toISOString().slice(0, 10)} />
      </div>

      {/* Web Table */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Web (CRO + Shopify)</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Date</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Day</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Sessions</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">ATC</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Orders</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">NSV</th>
              </tr>
            </thead>
            <tbody>
              {[selected, previous, ...sameDayHistory].map((row, i) => {
                const isSelected = i === 0;
                const isPrev = i === 1;
                const compareBase = isSelected ? previous : i >= 2 && sameDayHistory.length > 1 ? sameDayHistory[i - 1] : null;
                return (
                  <tr key={row.date} className={`border-b border-border/30 hover:bg-bg transition-colors ${isSelected ? 'bg-accent/5' : ''}`}>
                    <td className="py-2.5 px-3">
                      <span className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{row.date}</span>
                      {isSelected && isToday && <span className="ml-1.5 text-[9px] bg-accent/15 text-accent px-1 py-0.5 rounded">TODAY</span>}
                      {isSelected && !isToday && <span className="ml-1.5 text-[9px] bg-accent/15 text-accent px-1 py-0.5 rounded">SELECTED</span>}
                      {isPrev && <span className="ml-1.5 text-[9px] bg-border text-text-muted px-1 py-0.5 rounded">PREV DAY</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-text-muted">{row.day}</td>
                    <td className="py-2.5 px-3 text-sm text-right font-medium text-text-primary">
                      {fmt(row.webSessions)}{compareBase && <Delta curr={row.webSessions} prev={compareBase.webSessions} />}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right text-text-secondary">
                      {fmt(row.webAtc)}{compareBase && <Delta curr={row.webAtc} prev={compareBase.webAtc} />}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right text-text-secondary">
                      {fmt(row.shopifyOrders)}{compareBase && <Delta curr={row.shopifyOrders} prev={compareBase.shopifyOrders} />}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right font-medium text-text-primary">
                      {fmtCur(row.nsv)}{compareBase && <Delta curr={row.nsv} prev={compareBase.nsv} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* App Table */}
      <div>
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">App (Google Analytics)</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Date</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Day</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Sessions</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Active Users</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">New Users</th>
              </tr>
            </thead>
            <tbody>
              {[selected, previous, ...sameDayHistory].map((row, i) => {
                const isSelected = i === 0;
                const compareBase = isSelected ? previous : i >= 2 && sameDayHistory.length > 1 ? sameDayHistory[i - 1] : null;
                return (
                  <tr key={row.date + '-app'} className={`border-b border-border/30 hover:bg-bg transition-colors ${isSelected ? 'bg-accent/5' : ''}`}>
                    <td className="py-2.5 px-3 text-sm font-medium text-text-primary">{row.date}</td>
                    <td className="py-2.5 px-3 text-xs text-text-muted">{row.day}</td>
                    <td className="py-2.5 px-3 text-sm text-right font-medium text-text-primary">
                      {fmt(row.appSessions)}{compareBase && <Delta curr={row.appSessions} prev={compareBase.appSessions} />}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right text-text-secondary">
                      {fmt(row.appActiveUsers)}{compareBase && <Delta curr={row.appActiveUsers} prev={compareBase.appActiveUsers} />}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-right text-text-secondary">
                      {fmt(row.appNewUsers)}{compareBase && <Delta curr={row.appNewUsers} prev={compareBase.appNewUsers} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Averages bar */}
      {sameDayHistory.length > 1 && (() => {
        const avg = (key) => sameDayHistory.reduce((s, r) => s + (r[key] || 0), 0) / sameDayHistory.length;
        return (
          <div className="mt-3 bg-bg rounded-md p-2.5 border border-border/50">
            <div className="text-[10px] text-text-muted uppercase mb-1">Avg {dayName} ({sameDayHistory.length} weeks)</div>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {[
                ['Web Sess', 'webSessions'], ['ATC', 'webAtc'], ['Orders', 'shopifyOrders'],
                ['NSV', 'nsv', true], ['App Sess', 'appSessions'], ['App Users', 'appActiveUsers']
              ].map(([label, key, isCur]) => (
                <div key={key}>
                  <span className="text-text-muted">{label}:</span>{' '}
                  <span className="font-semibold">{isCur ? fmtCur(avg(key)) : fmt(avg(key))}</span>
                  <Delta curr={selected[key]} prev={avg(key)} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
