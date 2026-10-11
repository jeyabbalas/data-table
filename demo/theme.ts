/**
 * The demo's theme switch, shared by its pages: Light, Dark or Auto, which
 * follows the system. The choice is kept in this browser. Each page's
 * <head> applies it before the first paint, as `data-theme` on <html>;
 * this module keeps the switch and that attribute in step afterwards.
 */

import type { ColorScheme } from '@jeyabbalas/data-table';

const THEME_KEY = 'dt-demo-theme';

export function storedTheme(): ColorScheme {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === 'light' || theme === 'dark' ? theme : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Wire the page's theme radios (`input[name="theme"]`). Returns the scheme
 * in force; `onChange` hears each new one.
 */
export function initThemeSwitch(onChange?: (scheme: ColorScheme) => void): ColorScheme {
  const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="theme"]'));
  const apply = (scheme: ColorScheme) => {
    if (scheme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = scheme;
    for (const radio of radios) radio.checked = radio.value === scheme;
  };

  const initial = storedTheme();
  apply(initial);
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      const scheme = radio.value as ColorScheme;
      apply(scheme);
      try {
        if (scheme === 'auto') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, scheme);
      } catch {
        /* storage unavailable */
      }
      onChange?.(scheme);
    });
  }
  return initial;
}
