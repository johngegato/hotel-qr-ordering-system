export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#020617] text-[#f1f5f9] p-6 max-w-7xl mx-auto space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-white/10">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-slate-800 rounded-lg" />
          <div className="h-4 w-48 bg-slate-800/60 rounded" />
        </div>
        <div className="h-10 w-36 bg-slate-800 rounded-lg" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass rounded-xl p-5 border border-white/10 space-y-3">
            <div className="h-4 w-28 bg-slate-800 rounded" />
            <div className="h-8 w-20 bg-slate-800 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="glass rounded-xl border border-white/10 p-6 space-y-4">
        <div className="h-6 w-40 bg-slate-800 rounded" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-slate-800/40 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
