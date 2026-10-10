/**
 * The demo's documentation pages, Shortcuts and Examples: the theme
 * switch, the library version, and the Ctrl/Cmd keys labelled as the
 * reader's keyboard labels them.
 */

import { initThemeSwitch } from './theme';

declare const __DT_VERSION__: string;

initThemeSwitch();
document.getElementById('version')!.textContent = __DT_VERSION__;

// The table takes Ctrl or Cmd for these; an Apple keyboard says ⌘.
const platform =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
  navigator.platform;
if (/mac|iphone|ipad|ipod/i.test(platform)) {
  for (const key of document.querySelectorAll<HTMLElement>('kbd[data-mod]')) {
    key.textContent = '⌘';
    key.title = 'Command';
  }
}
