'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Admin Dashboard Error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#020617] text-[#f1f5f9] flex flex-col items-center justify-center p-6 text-center">
      <div className="glass max-w-md w-full p-8 rounded-2xl border border-red-500/20 shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-400 text-3xl">
          ⚠️
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Admin Dashboard Error
          </h2>
          <p className="text-sm text-slate-400">
            {error.message || 'An unexpected error occurred while loading dashboard data.'}
          </p>
        </div>

        <button
          onClick={reset}
          className="w-full py-3 px-4 rounded-xl font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
