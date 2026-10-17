export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 rounded bg-hover" />
      <div className="h-4 w-80 max-w-full rounded bg-hover" />
      <div className="h-40 rounded-lg border border-line bg-panel" />
      <div className="h-40 rounded-lg border border-line bg-panel" />
    </div>
  );
}
