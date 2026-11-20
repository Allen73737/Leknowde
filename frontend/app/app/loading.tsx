import { LogoLoader } from "@/components/brand/logo-loader";

/**
 * Route-level loading state for the workspace dashboard.
 * The brand mark carries the wait; the shell around it is a quiet skeleton so
 * the layout does not jump when the real data arrives.
 */
export default function AppLoading() {
  return (
    <div className="space-y-7" role="status" aria-live="polite">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[0.75rem] uppercase tracking-[0.16em] text-faint">
            <span aria-hidden="true" className="h-[3px] w-6 rounded-full bg-accent" />
            Workspace overview
          </div>
          <div className="mt-3 flex items-center gap-4">
            <LogoLoader size={30} />
            <div className="h-8 w-56 max-w-full skeleton rounded-md sm:w-72" />
          </div>
          <div className="mt-3 h-4 w-72 max-w-full skeleton rounded" />
        </div>
        <div className="h-10 w-36 shrink-0 skeleton rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-[104px] skeleton rounded-card border border-line" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="border-b border-line px-4 py-4">
            <div className="h-4 w-40 skeleton rounded" />
            <div className="mt-2 h-3 w-64 max-w-full skeleton rounded" />
          </div>
          <div className="divide-y divide-line">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/5 skeleton rounded" />
                  <div className="mt-2 h-3 w-3/5 skeleton rounded" />
                </div>
                <div className="h-4 w-4 shrink-0 skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="overflow-hidden rounded-card border border-line bg-surface"
            >
              <div className="border-b border-line px-4 py-4">
                <div className="h-4 w-32 skeleton rounded" />
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="h-3 w-4/5 skeleton rounded" />
                <div className="h-3 w-3/5 skeleton rounded" />
                <div className="h-3 w-2/3 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
