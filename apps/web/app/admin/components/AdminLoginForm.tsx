'use client'

import React, { useState } from 'react'
import { useAdminAuth } from './AdminAuthContext'

export default function AdminLoginForm() {
  const { login } = useAdminAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const res = await login(email, password)
    if (!res.success) {
      setErrorMessage(res.error || 'Authentication failed. Please check your credentials.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle, #6366f1 0%, #3b82f6 40%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-10 right-10 w-[350px] h-[350px] rounded-full blur-3xl pointer-events-none opacity-15"
        style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-md relative z-10 animate-fade-up">
        {/* Main Card */}
        <div
          className="rounded-3xl border border-white/15 p-7 sm:p-9 shadow-2xl backdrop-blur-xl"
          style={{ background: 'linear-gradient(160deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.95))' }}
        >
          {/* Header */}
          <div className="text-center space-y-3 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-3xl shadow-inner mx-auto mb-1">
              🛡️
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Admin Console</h1>
              <p className="text-xs uppercase tracking-widest text-indigo-400 font-extrabold mt-1">
                Hotel Operations Management
              </p>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs mx-auto">
              Please enter your authorized administrator or manager credentials to access the console.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-relaxed flex items-start gap-2.5 animate-shake">
              <span className="text-base flex-shrink-0">⚠️</span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2 uppercase tracking-wider">
                Staff Email Address
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                  ✉️
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hotel.local"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                  🔒
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-bold px-2 py-1 rounded-lg bg-white/5"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl font-black text-sm text-white shadow-xl shadow-indigo-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin text-base">⏳</span>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>Sign In to Admin Console</span>
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-8 pt-6 border-t border-white/10 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs font-semibold">
              <span>🔒</span> 256-Bit Encrypted Session
            </div>
            <p className="text-[11px] text-slate-500">
              Only users with <span className="text-indigo-300 font-bold">ADMIN</span> or{' '}
              <span className="text-indigo-300 font-bold">MANAGER</span> roles may log into this portal.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
