import CroFunnel from './CroFunnel';
import PagePerformance from './PagePerformance';
import RcaNotes from './RcaNotes';

export default function CroDashboard({ start, end }) {
  return (
    <div className="flex flex-col gap-4">
      <CroFunnel start={start} end={end} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PagePerformance start={start} end={end} mode="top" />
        <PagePerformance start={start} end={end} mode="worst" />
      </div>
      <RcaNotes start={start} end={end} />
    </div>
  );
}
