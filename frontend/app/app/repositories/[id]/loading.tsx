import { LogoLoader } from "@/components/brand/logo-loader";

/**
 * Body-level loading state for a repository surface.
 *
 * This fallback renders inside the repository layout, so the real identity
 * band and tabs stay interactive while the page body resolves — the skeleton
 * only mirrors the cards below.
 */
export default function RepositoryLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <LogoLoader size={24} label="Loading repository data" />
        <div className="h-3 w-24 skeleton rounded" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-[104px] skeleton rounded-card border border-line" />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <div className="border-b border-line px-4 py-4">
              <div className="h-4 w-44 skeleton rounded" />
              <div className="mt-2 h-3 w-56 max-w-full skeleton rounded" />
            </div>
            <div className="space-y-3.5 px-4 py-5">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="space-y-2">
                  <div className="flex justify-between gap-4">
                    <div className="h-3 w-1/3 skeleton rounded" />
                    <div className="h-3 w-10 skeleton rounded" />
                  </div>
                  <div className="h-1.5 w-full skeleton rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
