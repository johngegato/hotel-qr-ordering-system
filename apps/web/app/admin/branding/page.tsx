'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  GuestThemeMode,
  GuestWebContentConfig,
  HotelThemeConfig,
} from '@hotel-qr/supabase/types'
import {
  resolveGuestSurfaceTheme,
  THEME_MODE_LABELS,
} from '@/lib/guest-theme'
import { DEFAULT_CONTENT, mergeGuestContent } from '@/lib/guest-content'

const supabase = createSupabaseBrowserClient()
const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const TABS = [
  { id: 'theme', label: '🎨 Visual Theme' },
  { id: 'landing', label: '🏠 Welcome & Landing' },
  { id: 'sections', label: '📄 Sections & Modules' },
  { id: 'preview', label: '👁️ Live Preview' },
]

const PRESETS: { id: GuestThemeMode; label: string; colors: string[] }[] = [
  { id: 'DARK_GOLD', label: 'Dark Gold', colors: ['#0a0a0f', '#18181b', '#fbbf24', '#fbbf24'] },
  { id: 'CLEAN_LIGHT', label: 'Clean Light', colors: ['#f8fafc', '#ffffff', '#0f172a', '#b45309'] },
  { id: 'MINIMAL_WHITE', label: 'Minimal White', colors: ['#ffffff', '#fafafa', '#111827', '#111827'] },
  { id: 'LUXURY_NAVY', label: 'Luxury Navy', colors: ['#0c1631', '#16224a', '#f8fafc', '#e6c98a'] },
  { id: 'CUSTOM', label: 'Custom Brand', colors: ['#171717', '#262626', '#ffffff', '#f59e0b'] },
]

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function isHex(v: string) {
  return HEX_RE.test(v.trim())
}

function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0
    const n = parseInt(m[1], 16)
    const [r, g, bl] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export default function GuestWebBrandingPage() {
  const [tab, setTab] = useState('theme')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [themeMode, setThemeMode] = useState<GuestThemeMode>('DARK_GOLD')
  const [themeConfig, setThemeConfig] = useState<HotelThemeConfig>({
    bg_primary: '#0a0a0f',
    bg_surface: '#18181b',
    text_primary: '#f8fafc',
    text_secondary: '#94a3b8',
    accent_color: '#fbbf24',
    border_color: 'rgba(255,255,255,0.08)',
  })
  const [content, setContent] = useState<GuestWebContentConfig>(DEFAULT_CONTENT)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('hotels')
          .select('theme_mode, theme_config, content_config')
          .eq('id', HOTEL_ID)
          .maybeSingle()
        if (error) { console.error('[Branding] load error:', error); return }
        if (!data) return
        if (data.theme_mode && PRESETS.some((p) => p.id === data.theme_mode)) {
          setThemeMode(data.theme_mode as GuestThemeMode)
        }
        if (data.theme_config && typeof data.theme_config === 'object') {
          setThemeConfig((prev) => {
            const cfg = data.theme_config as HotelThemeConfig
            return {
              bg_primary: cfg.bg_primary || prev.bg_primary,
              bg_surface: cfg.bg_surface || prev.bg_surface,
              text_primary: cfg.text_primary || prev.text_primary,
              text_secondary: cfg.text_secondary || prev.text_secondary,
              accent_color: cfg.accent_color || prev.accent_color,
              border_color: cfg.border_color || prev.border_color,
            }
          })
        }
        if (data.content_config && typeof data.content_config === 'object') {
          setContent(mergeGuestContent(data.content_config as Partial<GuestWebContentConfig>))
        }
      } catch (err) {
        console.error('[Branding] load failed:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])
  const surface = useMemo(
    () => resolveGuestSurfaceTheme(themeMode, themeConfig, 'gold'),
    [themeMode, themeConfig]
  )

  const previewStyle: React.CSSProperties = useMemo(
    () => ({
      '--gw-bg': surface.bg_primary,
      '--gw-surface': surface.bg_surface,
      '--gw-text': surface.text_primary,
      '--gw-text-2': surface.text_secondary,
      '--gw-accent': surface.accent_color,
      '--gw-border': surface.border_color,
      background: surface.bg_primary,
      color: surface.text_primary,
    } as React.CSSProperties),
    [surface]
  )

  const contrastBg = useMemo(
    () => contrastRatio(surface.bg_primary, surface.text_primary),
    [surface.bg_primary, surface.text_primary]
  )
  const contrastSurface = useMemo(
    () => contrastRatio(surface.bg_surface, surface.text_secondary),
    [surface.bg_surface, surface.text_secondary]
  )

  const updateContent = useCallback(
    <K extends keyof GuestWebContentConfig>(
      section: K,
      key: keyof GuestWebContentConfig[K],
      value: string
    ) => {
      setContent((prev) => ({
        ...prev,
        [section]: { ...prev[section], [key]: value },
      }))
    },
    []
  )

  const handlePublish = useCallback(async () => {
    setSaving(true)
    setToast(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('hotels')
        .update({
          theme_mode: themeMode,
          theme_config: themeMode === 'CUSTOM' ? themeConfig : null,
          content_config: content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', HOTEL_ID)
      if (error) throw error
      setToast('✅ Guest web branding published successfully.')
    } catch (err) {
      console.error('[Branding] publish failed:', err)
      setToast('❌ Failed to publish branding. Please try again.')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }, [themeMode, themeConfig, content])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#f8fafc',
    fontSize: 14,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="text-4xl animate-spin mb-4">⏳</div>
        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-400">Loading Guest Web Branding…</p>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent">
              🎨 Guest Web Branding & Content
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Customize the visual theme and every piece of text your guests see.
            </p>
          </div>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50 transition-all"
          >
            {saving ? 'Publishing…' : 'Publish Changes'}
          </button>
        </div>

        {toast && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-slate-800/80 border border-white/10 text-sm font-semibold">
            {toast}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'text-amber-300 border-b-2 border-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'theme' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setThemeMode(preset.id)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    themeMode === preset.id
                      ? 'border-amber-400 bg-slate-800/60 ring-1 ring-amber-400/30'
                      : 'border-white/10 bg-slate-900/40 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex gap-1 mb-3">
                    {preset.colors.map((c, i) => (
                      <div key={i} className="w-6 h-6 rounded-full border border-white/10" style={{ background: c }} />
                    ))}
                  </div>
                  <div className="text-sm font-bold text-slate-100">{preset.label}</div>
                  <div className="text-xs text-slate-500">{THEME_MODE_LABELS[preset.id]}</div>
                </button>
              ))}
            </div>

            {themeMode === 'CUSTOM' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {([
                  ['bg_primary', 'Primary Background'],
                  ['bg_surface', 'Surface / Card Background'],
                  ['text_primary', 'Primary Text'],
                  ['text_secondary', 'Secondary Text'],
                  ['accent_color', 'Accent / Highlight'],
                  ['border_color', 'Border Color'],
                ] as Array<[keyof HotelThemeConfig, string]>).map(([key, label]) => (
                  <div key={key} className="bg-slate-900/40 border border-white/10 rounded-xl p-4">
                    <label style={labelStyle}>{label}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={isHex(themeConfig[key]) ? themeConfig[key] : '#000000'}
                        onChange={(e) => setThemeConfig((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={themeConfig[key]}
                        onChange={(e) => setThemeConfig((prev) => ({ ...prev, [key]: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-4 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-400">BG ↔ Text:</span>{' '}
                <span className={contrastBg >= 4.5 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {contrastBg.toFixed(2)} {contrastBg >= 4.5 ? '✓' : '⚠️'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Surface ↔ Text:</span>{' '}
                <span className={contrastSurface >= 4.5 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {contrastSurface.toFixed(2)} {contrastSurface >= 4.5 ? '✓' : '⚠️'}
                </span>
              </div>
            </div>
          </div>
        )}
        {tab === 'landing' && (
          <div className="grid md:grid-cols-2 gap-6">
            {([
              ['welcome_title', 'Welcome Title'],
              ['welcome_subtitle', 'Welcome Subtitle'],
              ['room_greeting_prefix', 'Room Greeting Prefix'],
              ['hero_banner_text', 'Hero Announcement Banner'],
            ] as Array<[keyof GuestWebContentConfig['landing'], string]>).map(([key, label]) => (
              <div key={key} className="bg-slate-900/40 border border-white/10 rounded-xl p-4">
                <label style={labelStyle}>{label}</label>
                <input type="text" value={content.landing[key]}
                  onChange={(e) => updateContent('landing', key, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
        )}

        {tab === 'sections' && (
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">🍽️ Dining Section</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ['title', 'Section Title'],
                  ['subtitle', 'Subtitle'],
                  ['fnb_call_button_text', 'Direct Dial Button Label'],
                  ['special_instructions_placeholder', 'Order Notes Placeholder'],
                ] as Array<[keyof GuestWebContentConfig['dining'], string]>).map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="text" value={content.dining[key]}
                      onChange={(e) => updateContent('dining', key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">💆 Spa & Wellness</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ['title', 'Section Title'],
                  ['subtitle', 'Subtitle'],
                ] as Array<[keyof GuestWebContentConfig['spa'], string]>).map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="text" value={content.spa[key]}
                      onChange={(e) => updateContent('spa', key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">🛎️ Room Services</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ['title', 'Section Title'],
                  ['subtitle', 'Subtitle'],
                ] as Array<[keyof GuestWebContentConfig['requests'], string]>).map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="text" value={content.requests[key]}
                      onChange={(e) => updateContent('requests', key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">🤖 AI Assistant</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ['widget_title', 'Assistant Display Name'],
                  ['welcome_message', 'Welcome Message'],
                  ['quick_prompt_1', 'Quick Prompt 1'],
                  ['quick_prompt_2', 'Quick Prompt 2'],
                ] as Array<[keyof GuestWebContentConfig['ai_chat'], string]>).map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="text" value={content.ai_chat[key]}
                      onChange={(e) => updateContent('ai_chat', key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">📝 Footer & Support</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ['copyright_text', 'Copyright / Closing Text'],
                  ['support_contact_text', 'Support Contact Text'],
                ] as Array<[keyof GuestWebContentConfig['footer'], string]>).map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="text" value={content.footer[key]}
                      onChange={(e) => updateContent('footer', key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'preview' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold text-amber-300 mb-4">Phone-Sized Guest Preview</h3>
              <div className="mx-auto rounded-[2rem] border-4 border-slate-700 overflow-hidden shadow-2xl"
                style={{ width: 375, maxWidth: '100%', height: 700 }}>
                <div className="h-full w-full overflow-y-auto p-4 space-y-4" style={previewStyle}>
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: 'var(--gw-surface)', border: '1px solid var(--gw-border)' }}>
                    <div className="text-2xl font-extrabold" style={{ color: 'var(--gw-text)' }}>
                      {content.landing.welcome_title}
                    </div>
                    <div style={{ color: 'var(--gw-text-2)', fontSize: 13 }}>
                      {content.landing.welcome_subtitle}
                    </div>
                    <div className="text-xs px-3 py-2 rounded-lg"
                      style={{ background: 'var(--gw-accent)', color: surface.bg_primary, fontWeight: 700 }}>
                      {content.landing.hero_banner_text}
                    </div>
                  </div>
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: 'var(--gw-surface)', border: '1px solid var(--gw-border)' }}>
                    <div className="font-bold" style={{ color: 'var(--gw-text)' }}>{content.dining.title}</div>
                    <div style={{ color: 'var(--gw-text-2)', fontSize: 12 }}>{content.dining.subtitle}</div>
                    <button className="w-full py-2 rounded-lg font-bold text-sm"
                      style={{ background: 'var(--gw-accent)', color: surface.bg_primary }}>
                      {content.dining.fnb_call_button_text}
                    </button>
                  </div>
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: 'var(--gw-surface)', border: '1px solid var(--gw-border)' }}>
                    <div className="font-bold" style={{ color: 'var(--gw-text)' }}>{content.spa.title}</div>
                    <div style={{ color: 'var(--gw-text-2)', fontSize: 12 }}>{content.spa.subtitle}</div>
                  </div>
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: 'var(--gw-surface)', border: '1px solid var(--gw-border)' }}>
                    <div className="font-bold" style={{ color: 'var(--gw-text)' }}>{content.requests.title}</div>
                    <div style={{ color: 'var(--gw-text-2)', fontSize: 12 }}>{content.requests.subtitle}</div>
                  </div>
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: 'var(--gw-surface)', border: '1px solid var(--gw-border)' }}>
                    <div className="font-bold" style={{ color: 'var(--gw-text)' }}>{content.ai_chat.widget_title}</div>
                    <div style={{ color: 'var(--gw-text-2)', fontSize: 12 }}>{content.ai_chat.welcome_message}</div>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 rounded"
                        style={{ background: 'var(--gw-accent)', color: surface.bg_primary }}>
                        {content.ai_chat.quick_prompt_1}
                      </span>
                      <span className="px-2 py-1 rounded"
                        style={{ background: 'var(--gw-accent)', color: surface.bg_primary }}>
                        {content.ai_chat.quick_prompt_2}
                      </span>
                    </div>
                  </div>
                  <div className="text-center text-xs py-4" style={{ color: 'var(--gw-text-2)' }}>
                    <div>{content.footer.copyright_text}</div>
                    <div>{content.footer.support_contact_text}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold text-amber-300 mb-2">Current Theme Values</h3>
                <pre className="text-xs text-slate-300 overflow-auto max-h-60 bg-slate-950/50 p-3 rounded-lg">
                  {JSON.stringify({ themeMode, themeConfig }, null, 2)}
                </pre>
              </div>
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-5">
                <h3 className="text-lg font-bold text-amber-300 mb-2">Current Content Payload</h3>
                <pre className="text-xs text-slate-300 overflow-auto max-h-60 bg-slate-950/50 p-3 rounded-lg">
                  {JSON.stringify(content, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
