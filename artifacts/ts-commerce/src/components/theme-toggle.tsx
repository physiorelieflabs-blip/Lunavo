import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ts-commerce-theme';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full border border-[#d9d2c4] bg-[#fbfaf6] px-3 py-2.5 text-xs font-extrabold text-[#536174] shadow-[0_12px_28px_rgba(24,35,51,.14)] transition hover:-translate-y-0.5 hover:border-[#bca26a] hover:text-[#182333] dark:border-[#344552] dark:bg-[#18232d] dark:text-[#d8e1e3] dark:hover:border-[#d6aa46] dark:hover:text-[#f8f3e8]"
      aria-label={`Switch to ${nextTheme} mode`}
      data-testid="button-theme-toggle"
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}