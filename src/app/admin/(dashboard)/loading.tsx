export default function AdminDashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-6 animate-pulse"
    >
      <div className="border-b border-warm-sand pb-4">
        <div className="h-3 w-32 bg-warm-sand" />
        <div className="mt-2 h-8 w-56 bg-warm-sand" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 border border-warm-sand bg-[#FCFBF7] p-5"
          >
            <div className="h-3 w-20 bg-warm-sand" />
            <div className="mt-4 h-7 w-16 bg-warm-sand" />
          </div>
        ))}
      </div>
      <div className="h-64 border border-warm-sand bg-[#FCFBF7]" />
      <span className="sr-only">Loading dashboard data...</span>
    </div>
  );
}
