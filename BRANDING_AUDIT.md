# Guest Branding Audit — Technical Blueprint

> Analysis of guest-facing theme consistency across the hotel QR ordering system.

---

## Executive Summary

| Issue | Status | Priority |
|-------|--------|----------|
| Landing page (`app/page.tsx`) not wrapped in `GuestSettingsProvider` | **BUG** | P0 |
| FAB buttons have fully hardcoded gradients (not themeable) | **BUG** | P1 |
| Booking summary buttons in spa page use hardcoded gradients | **MEDIUM** | P2 |
| Modal styles in dining/spa use hardcoded rgba fallback | LOW | P3 |
|globals.css orb gradients hardcoded | LOW | P4 |

---

## 🔴 P0 — Landing Page Missing Theme Provider

**Location:** `apps/web/app/page.tsx`

**Problem:** The landing page (`HomePage`) displays before guests scan their QR code, but it:
- Does NOT wrap content in `GuestSettingsProvider`
- Uses hardcoded `#fbbf24` (amber) gradient for the demo button
- Uses hardcoded gold text gradient
- Should reflect the hotel’s brand colors set in the admin panel

**Fix:** Wrap the page content in `GuestSettingsProvider` and use CSS variables.

**apps/web/app/page.tsx**

Replace the export:
```tsx
export default function HomePage() {
  return (
    <GuestSettingsProvider>
      {/* existing content */}
    </GuestSettingsProvider>
  )
}
```

Add import at top:
```tsx
import { GuestSettingsProvider } from './app/stay/components/GuestSettingsProvider'
```

Convert hardcoded colors to CSS variables:
```tsx
// Demo button
style={{
  background: 'var(--gw-accent)',
  color: 'var(--gw-bg)',
}}

// Text gradient
<span className="text-gold-gradient"> → use text style with var(--gw-accent)
```

---

## 🟠 P1 — FAB Buttons Hardcoded (Not Themeable)

### 1. FrontDeskFAB (`apps/web/app/app/stay/components/FrontDeskFAB.tsx`)

**Current (hardcoded):**
```tsx
style={{
  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #d97706 100%)',
  boxShadow: '0 10px 30px -4px rgba(245, 158, 11, 0.55), 0 0 20px rgba(251, 191, 36, 0.4)',
}}
```

**Fix:** Import `useGuestTheme` and use theme tokens:
```tsx
import { useGuestTheme } from './GuestThemeProvider'

const theme = useGuestTheme()
// ... in render:
style={{
  background: `linear-gradient(135deg, ${theme.secondaryHex} 0%, ${theme.primaryHex} 50%, ${theme.hoverBg} 100%)`,
  boxShadow: `0 10px 30px -4px ${theme.glowRgba}, 0 0 20px ${theme.glowRgba}`,
}}
```

### 2. FnBDiningFAB (`apps/web/app/app/stay/components/FnBDiningFAB.tsx`)

**Current (hardcoded emerald):**
```tsx
style={{
  background: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #059669 100%)',
  boxShadow: '0 10px 25px -4px rgba(16, 185, 129, 0.55), 0 0 15px rgba(52, 211, 153, 0.35)',
}}
```

**Fix:** Same pattern — import `useGuestTheme` and construct gradient from theme tokens. Note: Dining FAB currently uses **emerald regardless of theme** (intentional brand differentiation). If this should follow theme, apply the same fix.

---

## 🟡 P2 — Spa Booking Summary Button Hardcoded

**Location:** `apps/web/app/app/stay/spa/page.tsx:823-831`

**Current:**
```tsx
style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
```

**Fix:** Add `useGuestTheme` hook and use:
```tsx
style={{ background: `linear-gradient(135deg, ${theme.secondaryHex}, ${theme.primaryHex})` }}
```

---

## 🟢 Optional Enhancements (P3-P4)

| File | Issue | Suggestion |
|------|-------|----------|
| `globals.css .bg-orb-{1,2,3}` | Orb gradients hardcoded to gold/blue/cyan | Could be made dynamic via CSS-in-JS if admin wants custom orbs |
| `dining/page.tsx` modal styles | Uses `rgba(17, 20, 32, 0.98)` for background | Could use `var(--gw-bg)` with opacity |
| `spa/page.tsx` booking summary | Uses `bg-purple-500/20` | Should use theme-based color |

---

## Implementation Checklist

| File | Change | Est. Effort |
|------|--------|-------------|
| `apps/web/app/page.tsx` | Import GuestSettingsProvider, wrap content, update styles | 15 min |

**Status:** ✅ `GuestSettingsProvider` wrapping applied to `apps/web/app/page.tsx` and verified via type-check.
| `apps/web/app/app/stay/components/FrontDeskFAB.tsx` | Import useGuestTheme, use tokens | 10 min |
| `apps/web/app/app/stay/components/FnBDiningFAB.tsx` | Update gradient (optional) | 10 min |
| `apps/web/app/app/stay/spa/page.tsx:831` | Update "Book Another Treatment" button gradient | 5 min |

---

## Rollout Notes

- Landing page change requires rebuilding the root `/` page (no native code changes needed)
- FAB changes are pure client-side React; deploy via Vercel
- Theme variables update automatically via Supabase Realtime subscription — guests see changes live without refresh