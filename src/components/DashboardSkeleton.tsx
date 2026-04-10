export function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-auto p-4 bg-slate-50">
      {/* Title skeleton */}
      <div className="mb-4 space-y-2">
        <div className="skeleton-text w-64 h-5" />
        <div className="skeleton-text w-96 h-3 opacity-60" />
      </div>

      {/* Summary stats skeleton */}
      <div className="flex gap-6 px-4 py-3 bg-white border border-slate-200 rounded-lg shadow-sm">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex-shrink-0 space-y-2 card-entrance" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="skeleton-text w-16 h-2.5" />
            <div className="skeleton w-20 h-6" />
          </div>
        ))}
      </div>

      {/* Chart grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm card-entrance"
            style={{ animationDelay: `${300 + i * 120}ms` }}
          >
            {/* Chart header */}
            <div className="px-4 py-3 border-b border-slate-100 space-y-1.5">
              <div className="skeleton-text w-40 h-3.5" />
              <div className="skeleton-text w-56 h-2.5 opacity-50" />
            </div>
            {/* Chart body */}
            <div className="p-4">
              <div className="skeleton w-full h-[250px]" />
            </div>
          </div>
        ))}
      </div>

      {/* Generating indicator */}
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-400 animate-pulse">
          Analyzing your data and building charts...
        </p>
      </div>
    </div>
  );
}
