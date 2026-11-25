"use client";

export default function AdminDashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="border border-[#7A271A]/35 bg-[#FCFBF7] p-8 text-center"
    >
      <h1 className="font-serif text-2xl font-semibold text-forest-green">
        Unable to Load Workspace
      </h1>
      <p className="mt-2 text-sm text-forest-green/80">
        An unexpected error occurred while loading live administrative data.
        Please try again.
      </p>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
