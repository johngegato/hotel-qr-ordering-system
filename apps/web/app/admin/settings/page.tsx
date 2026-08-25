'use client'

import { useState, useEffect } from 'react'
import type { Database } from '@hotel-qr/supabase/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { GUEST_THEMES, GuestColorScheme, getGuestTheme } from '@/lib/guest-theme'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const LOGO_PRESETS = [
  { id: 'crown', label: '👑 Luxury Crown', url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=120' },
  { id: 'palace', label: '🏨 Grand Palace', url: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=120' },
  { id: 'resort', label: '🌊 Seaside Resort', url: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=120' },
  { id: 'palm', label: '🌴 Tropical Palms', url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=120' },
  { id: 'tower', label: '🏙️ Modern Tower', url: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=120' },
]

export default function HotelSettingsPage() {
  const [hotelName, setHotelName] = useState('Grand Hotel & Spa')
  const [phone, setPhone] = useState('+1-800-555-0100')
  const [logoUrl, setLogoUrl] = useState('https://images.unsplash.com/photo-1566073771259-6a8506099945?w=120')
  const [colorScheme, setColorScheme] = useState<GuestColorScheme>('gold')

  // Service Charge Settings
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(true)
  const [serviceChargePct, setServiceChargePct]         = useState<number>(10)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch current hotel settings from Supabase
  useEffect(() => {
    async function loadHotelSettings() {
      setLoading(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('hotels')
          .select('name, phone, logo_url, color_scheme, service_charge_enabled, service_charge_pct')
          .eq('id', HOTEL_ID)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load hotel settings:', error)
        }

        if (data) {
          if (data.name) setHotelName(data.name)
          if (data.phone) setPhone(data.phone)
          if (data.logo_url) setLogoUrl(data.logo_url)
          if (data.color_scheme) setColorScheme(data.color_scheme as GuestColorScheme)
          setServiceChargeEnabled(data.service_charge_enabled ?? true)
          setServiceChargePct(Number(data.service_charge_pct ?? 10))
        }
      } catch (err) {
        console.error('Error loading hotel data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadHotelSettings()
  }, [])

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setToastMessage(null)
    setErrorMessage(null)

    try {
      // 1. Update hotels table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('hotels')
        .update({
          name: hotelName.trim(),
          phone: phone.trim(),
          logo_url: logoUrl.trim(),
          color_scheme: colorScheme,
          service_charge_enabled: serviceChargeEnabled,
          service_charge_pct: serviceChargePct,
        })
        .eq('id', HOTEL_ID)

      if (error) throw error

      // 2. Insert audit log record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_logs').insert([
        {
          hotel_id: HOTEL_ID,
          action: 'HOTEL_SETTINGS_UPDATED',
          details: {
            name: hotelName.trim(),
            phone: phone.trim(),
            logo_url: logoUrl.trim(),
            color_scheme: colorScheme,
          },
        },
      ])

      setToastMessage('Hotel settings saved successfully!')
      setTimeout(() => setToastMessage(null), 4000)
    } catch (err: unknown) {
      console.error('Error saving hotel settings:', err)
      setErrorMessage((err as Error).message || 'Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const selectedTheme = getGuestTheme(colorScheme)

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <a href="/admin" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none', fontWeight: 600 }}>
                ← Admin Dashboard
              </a>
              <span style={{ fontSize: 13, color: '#475569' }}>/</span>
              <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>⚙️ Hotel Settings</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Hotel Settings & Branding</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
              Configure property details, direct call contact info, logo image, and guest web app color scheme.
            </p>
          </div>

          <a
            href="/admin"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', textDecoration: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 13 }}
          >
            Return to Portal
          </a>
        </div>

        {/* Success / Error Banners */}
        {toastMessage && (
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', padding: '12px 18px', borderRadius: 14, marginBottom: '1.5rem', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✅</span> {toastMessage}
          </div>
        )}
        {errorMessage && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px 18px', borderRadius: 14, marginBottom: '1.5rem', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> {errorMessage}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>Loading hotel settings...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem' }}>
            {/* Form Column */}
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Hotel Basic Info Box */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 20, padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏨</span> Basic Hotel Details
                </h3>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                    Hotel Name
                  </label>
                  <input
                    type="text"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    required
                    placeholder="e.g. Grand Hotel & Spa"
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Appears in guest headers, welcome banners, and staff tablet alerts.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                    Front Desk Phone Number (Direct Calling)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="e.g. +1-800-555-0100"
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Guests tapping &quot;Direct Phone Call&quot; in the web app will directly dial this number.
                  </span>
                </div>
              </div>

              {/* Logo & Visual Branding Box */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 20, padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🖼️</span> Hotel Logo & Icon
                </h3>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                    Logo Image URL
                  </label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                    Or Pick a Preset Hotel Image:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {LOGO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setLogoUrl(preset.url)}
                        style={{
                          background: logoUrl === preset.url ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                          border: logoUrl === preset.url ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.08)',
                          color: logoUrl === preset.url ? '#fbbf24' : '#cbd5e1',
                          padding: '6px 12px',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Guest App Color Scheme Box */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 20, padding: '1.5rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🎨</span> Guest App Color Scheme
                    </h3>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', padding: '2px 8px', borderRadius: 10 }}>
                      Guest Web UI Only
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                    This color scheme dynamically styles the guest mobile web app (buttons, gradients, orbs, badges). Admin & staff interfaces remain unaffected.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
                  {Object.values(GUEST_THEMES).map((theme) => {
                    const isSelected = colorScheme === theme.id
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setColorScheme(theme.id)}
                        style={{
                          background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          border: isSelected ? `2px solid ${theme.primaryHex}` : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 14,
                          padding: '12px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'all 0.2s',
                        }}
                      >
                        {/* Swatch Circle */}
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: theme.gradient,
                            boxShadow: `0 0 12px ${theme.glowRgba}`,
                            marginBottom: 8,
                          }}
                        />

                        <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#fff' : '#cbd5e1' }}>
                          {theme.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                          {theme.id.toUpperCase()}
                        </div>

                        {isSelected && (
                          <span style={{ position: 'absolute', top: 10, right: 10, color: theme.primaryHex, fontSize: 14 }}>
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Service Charge Box */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 20, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>💳</span> Service Charge
                  </h3>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', padding: '2px 8px', borderRadius: 10 }}>
                    Dining Only
                  </span>
                </div>
                <p style={{ margin: '0 0 1.25rem', color: '#94a3b8', fontSize: 12 }}>
                  When enabled, a service charge is automatically added to all dining orders at checkout. Spa and other service requests are not affected.
                </p>

                {/* Enable / Disable Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 2 }}>Apply Service Charge</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Toggle off to disable for all guests</div>
                  </div>
                  <button
                    type="button"
                    id="toggle-service-charge"
                    onClick={() => setServiceChargeEnabled(v => !v)}
                    style={{
                      position: 'relative',
                      width: 52,
                      height: 28,
                      borderRadius: 14,
                      border: 'none',
                      background: serviceChargeEnabled
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : 'rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      transition: 'background 0.25s',
                      flexShrink: 0,
                      boxShadow: serviceChargeEnabled ? '0 0 12px rgba(34,197,94,0.35)' : 'none',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: 3,
                      left: serviceChargeEnabled ? 27 : 3,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.25s',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>

                {/* Percentage Input */}
                <div style={{ marginBottom: '1.25rem', opacity: serviceChargeEnabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                    Service Charge Percentage (%)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      id="input-service-charge-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={serviceChargePct}
                      disabled={!serviceChargeEnabled}
                      onChange={(e) => setServiceChargePct(Math.min(100, Math.max(0, Number(e.target.value))))}
                      style={{
                        width: 100,
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        padding: '10px 14px',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        outline: 'none',
                        textAlign: 'center',
                      }}
                    />
                    <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>% of subtotal</span>
                  </div>
                </div>

                {/* Live Preview */}
                <div style={{
                  background: serviceChargeEnabled ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${serviceChargeEnabled ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  transition: 'all 0.25s',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Live Preview</div>
                  {serviceChargeEnabled ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                        <span>Subtotal</span><span>₱500.00</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#fbbf24' }}>
                        <span>Service Charge ({serviceChargePct}%)</span>
                        <span>+₱{(500 * serviceChargePct / 100).toFixed(2)}</span>
                      </div>
                      <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#f97316', fontWeight: 800 }}>
                        <span>Total</span>
                        <span>₱{(500 + 500 * serviceChargePct / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>🚫</span>
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Service charge disabled — guests pay subtotal only</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: 14,
                  padding: '14px 24px',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(251,191,36,0.3)',
                  transition: 'opacity 0.2s, transform 0.1s',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving Settings...' : '💾 Save Hotel Settings'}
              </button>
            </form>

            {/* Live Interactive Guest Mobile Preview Column */}
            <div>
              <div style={{ position: 'sticky', top: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                    📱 Live Guest UI Preview
                  </h3>
                  <span style={{ fontSize: 11, color: '#475569' }}>Real-time Mockup</span>
                </div>

                {/* Mobile Frame */}
                <div
                  style={{
                    background: '#020617',
                    border: '8px solid #1e293b',
                    borderRadius: 36,
                    padding: '24px 18px',
                    position: 'relative',
                    overflow: 'hidden',
                    minHeight: 520,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                  }}
                >
                  {/* Decorative Background Orb */}
                  <div
                    style={{
                      position: 'absolute',
                      width: 240,
                      height: 240,
                      borderRadius: '50%',
                      background: selectedTheme.orbGradient,
                      top: -60,
                      right: -60,
                      opacity: 0.25,
                      filter: 'blur(40px)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Mock Mobile Content */}
                  <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                    {/* Hotel Logo Avatar */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Hotel Logo"
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 18,
                            objectFit: 'cover',
                            border: `2px solid ${selectedTheme.primaryHex}`,
                            boxShadow: `0 0 16px ${selectedTheme.glowRgba}`,
                          }}
                          onError={(e) => {
                            // Fallback on image error
                            ;(e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 18,
                            background: selectedTheme.badgeBg,
                            border: `1px solid ${selectedTheme.badgeBorder}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32,
                          }}
                        >
                          🏨
                        </div>
                      )}
                    </div>

                    {/* Hotel Name */}
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                      {hotelName || 'Grand Hotel'}
                    </p>

                    {/* Welcome Title with Dynamic Theme Gradient */}
                    <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', color: '#fff' }}>
                      Welcome to <br />
                      <span
                        style={{
                          background: selectedTheme.gradient,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        Room 302
                      </span>
                    </h2>

                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Deluxe Suite · Floor 3</p>

                    {/* Session Active Badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20, background: selectedTheme.badgeBg, border: `1px solid ${selectedTheme.badgeBorder}`, color: selectedTheme.primaryHex, fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: selectedTheme.primaryHex }} />
                      Session Active
                    </div>

                    {/* Action Buttons Mockup */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          background: selectedTheme.gradient,
                          color: selectedTheme.id === 'slate' ? '#0f172a' : '#0f172a',
                          border: 'none',
                          borderRadius: 14,
                          padding: '12px',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        📞 Call Front Desk ({phone || 'No phone set'})
                      </button>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px', fontSize: 12, color: '#cbd5e1' }}>
                          🍽️ Dining Menu
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px', fontSize: 12, color: '#cbd5e1' }}>
                          💆 Spa Booking
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
