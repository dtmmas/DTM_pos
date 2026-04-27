import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  toggleMode: () => void
}

function detectSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(t: Theme, mode?: ThemeMode) {
  try {
    document.documentElement.setAttribute('data-theme', t)
    if (mode) document.documentElement.setAttribute('data-theme-mode', mode)
  } catch {}
}

let initialMode: ThemeMode = 'dark'
try {
  const raw = localStorage.getItem('themeMode') as ThemeMode | null
  if (raw === 'light' || raw === 'dark' || raw === 'system') initialMode = raw
} catch {}

let initialTheme: Theme = initialMode === 'system' ? detectSystemTheme() : (initialMode as Theme)

// Aplicar inmediatamente para evitar flash
try { applyTheme(initialTheme, initialMode) } catch {}

function subscribeSystemChanges(onChange: (t: Theme) => void) {
  if (!window.matchMedia) return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange(media.matches ? 'dark' : 'light')
  try { media.addEventListener('change', handler) } catch { media.addListener(handler) }
  return () => {
    try { media.removeEventListener('change', handler) } catch { media.removeListener(handler) }
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  let unsub: (() => void) | null = null
  return {
    theme: initialTheme,
    mode: initialMode,
    setMode(m) {
      try { localStorage.setItem('themeMode', m) } catch {}
      if (unsub) { try { unsub() } catch {} ; unsub = null }
      if (m === 'system') {
        const sys = detectSystemTheme()
        applyTheme(sys, m)
        set({ mode: m, theme: sys })
        unsub = subscribeSystemChanges((t) => {
          applyTheme(t, 'system')
          set({ theme: t })
        })
      } else {
        applyTheme(m as Theme, m)
        set({ mode: m, theme: m as Theme })
      }
    },
    toggleMode() {
      const current = get().mode
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'
      get().setMode(next)
    },
  }
})