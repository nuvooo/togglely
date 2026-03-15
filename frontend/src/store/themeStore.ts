import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  resolvedTheme: 'light' | 'dark';
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;
  
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
  
  return resolved;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',
      
      setTheme: (theme) => {
        const resolved = applyTheme(theme);
        set({ theme, resolvedTheme: resolved || (theme === 'system' ? getSystemTheme() : theme) });
      },
      
      toggleTheme: () => {
        const current = get().resolvedTheme;
        const newTheme = current === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
        set({ theme: newTheme, resolvedTheme: newTheme });
      },
    }),
    {
      name: 'togglely-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = applyTheme(state.theme);
          state.resolvedTheme = resolved || (state.theme === 'system' ? getSystemTheme() : state.theme);
        }
      },
    }
  )
);

// Initialize theme immediately on script load (prevents flash)
if (typeof window !== 'undefined') {
  // Try to get theme from localStorage immediately
  const stored = localStorage.getItem('togglely-theme');
  let theme: Theme = 'system';
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      theme = parsed.state?.theme || 'system';
    } catch {
      theme = 'system';
    }
  }
  
  // Apply theme immediately before React hydration
  applyTheme(theme);
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const store = useThemeStore.getState();
    if (store.theme === 'system') {
      const newTheme = e.matches ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', e.matches);
      document.documentElement.setAttribute('data-theme', newTheme);
      useThemeStore.setState({ resolvedTheme: newTheme });
    }
  });
}
