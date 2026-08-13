export default function StayLoading() {
  return (
    <div className="min-h-screen bg-[#020617] text-[#f1f5f9] p-4 sm:p-6 max-w-lg mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
        <div className="h-6 w-32 bg-slate-800 rounded" />
        <div className="h-10 w-48 bg-slate-800 rounded-lg" />
        <div className="h-4 w-40 bg-slate-800/60 rounded" />
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass p-6 rounded-2xl border border-white/10 space-y-3 flex flex-col items-center justify-center h-32">
            <div className="w-10 h-10 bg-slate-800 rounded-full" />
            <div className="h-4 w-20 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
