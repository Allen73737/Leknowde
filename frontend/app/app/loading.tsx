import { LogoLoader } from "@/components/brand/logo-loader";

/**
 * Route-level loading state for the workspace dashboard.
 * The brand mark carries the wait; the shell around it is a quiet skeleton so
 * the layout does not jump when the real data arrives.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <LogoLoader size={30} />
            <div className="h-8 w-56 max-w-full skeleton rounded-md sm:w-72" />
          </div>
          <div className="mt-3 h-4 w-72 max-w-full skeleton rounded" />
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="h-8 w-28 skeleton rounded-md" />
          <div className="h-8 w-36 skeleton rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-[104px] bg-surface px-5 py-4">
            <div className="h-3 w-20 skeleton rounded" />
            <div className="mt-3 h-7 w-16 skeleton rounded" />
            <div className="mt-3 h-3 w-28 skeleton rounded" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <div className="h-4 w-40 skeleton rounded" />
            <div className="mt-2 h-3 w-64 max-w-full skeleton rounded" />
          </div>
          <div className="divide-y divide-line">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/5 skeleton rounded" />
                  <div className="mt-2 h-3 w-3/5 skeleton rounded" />
                </div>
                <div className="h-4 w-4 shrink-0 skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <div className="h-4 w-28 skeleton rounded" />
            <div className="mt-2 h-3 w-44 skeleton rounded" />
          </div>
          <div className="divide-y divide-line">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="px-5 py-4">
                <div className="h-4 w-3/5 skeleton rounded" />
                <div className="mt-2 h-3 w-4/5 skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[74px] rounded-card border border-line bg-surface" />
    </div>
  );
}
