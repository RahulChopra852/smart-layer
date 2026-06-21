import WebVitals from './WebVitals';

export default function WebVitalsTab({ start, end }) {
  return (
    <div className="flex flex-col gap-4">
      <WebVitals start={start} end={end} />
    </div>
  );
}
