'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export interface AdminSessionUser {
  id: string
  full_name: string
  email: string
  role: string
  hotel_id: string
}

interface AdminAuthContextType {
  adminUser: AdminSessionUser | null
  loading: boolean
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

const ADMIN_STORAGE_KEY = 'hotel_admin_auth_session'

export function isAdminOrManager(role?: string): boolean {
  if (!role) return false
  const r = role.toUpperCase().trim()
  return r === 'ADMIN' || r === 'MANAGER' || r.includes('ADMIN') || r.includes('MANAGER')
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialize and verify stored session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADMIN_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as AdminSessionUser
        if (parsed && parsed.id && parsed.email && isAdminOrManager(parsed.role)) {
          setAdminUser(parsed)
        } else {
          localStorage.removeItem(ADMIN_STORAGE_KEY)
        }
      }
    } catch {
      localStorage.removeItem(ADMIN_STORAGE_KEY)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (emailInput: string, passwordInput: string) => {
    const cleanEmail = emailInput.trim().toLowerCase()
    const cleanPass = passwordInput.trim()

    if (!cleanEmail || !cleanPass) {
      return { success: false, error: 'Please enter both your email address and password.' }
    }

    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await (supabase.from('staff_users') as any)
        .select('id, hotel_id, full_name, email, role, password, is_active')
        .eq('email', cleanEmail)
        .maybeSingle()

      if (error) {
        console.error('Admin login error:', error)
        return { success: false, error: 'Database connection failed. Please check network and try again.' }
      }

      if (!data) {
        return { success: false, error: 'No staff account found with this email address.' }
      }

      if (data.is_active !== true) {
        return { success: false, error: 'This staff account has been deactivated. Contact the hotel system administrator.' }
      }

      if (data.password !== cleanPass) {
        return { success: false, error: 'Incorrect password. Please verify your credentials and try again.' }
      }

      // Check role authorization: Only ADMIN or MANAGER allowed
      if (!isAdminOrManager(data.role)) {
        return {
          success: false,
          error: `Access Denied: The Admin Console requires an ADMIN or MANAGER account. Your current role is "${data.role}".`,
        }
      }

      const sessionData: AdminSessionUser = {
        id: data.id,
        hotel_id: data.hotel_id,
        full_name: data.full_name,
        email: data.email,
        role: data.role,
      }

      setAdminUser(sessionData)
      try {
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(sessionData))
      } catch {
        // non-fatal
      }

      return { success: true }
    } catch (err) {
      console.error('Unexpected admin login error:', err)
      return { success: false, error: 'An unexpected error occurred during login. Please try again.' }
    }
  }, [])

  const logout = useCallback(() => {
    setAdminUser(null)
    try {
      localStorage.removeItem(ADMIN_STORAGE_KEY)
    } catch {
      // non-fatal
    }
  }, [])

  return (
    <AdminAuthContext.Provider value={{ adminUser, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  }
  return context
}
