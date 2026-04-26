/**
 * AddColumnButton — a thin vertical "+" strip at the table's right edge.
 *
 * Clicking it opens the DerivedColumnModal for creating new derived columns.
 * Positioned absolutely within .dt-root, spanning full height.
 */

import { type Strings, defaultStrings } from '../core/Strings';

/** Construction options for {@link AddColumnButton}. */
export interface AddColumnButtonOptions {
  classPrefix?: string;
  onClick?: () => void;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings;
}

/**
 * Vertical "+" affordance positioned at the table's right edge that opens the
 * derived-column modal. Composed by the facade when derived-column UI is
 * enabled.
 */
export class AddColumnButton {
  private element: HTMLElement;
  private destroyed = false;
  private readonly prefix: string;
  private readonly messages: Strings;

  constructor(private options: AddColumnButtonOptions = {}) {
    this.prefix = options.classPrefix ?? 'dt';
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
  }

  private createElement(): HTMLElement {
    const p = this.prefix;

    const btn = document.createElement('button');
    btn.className = `${p}-add-column-btn`;
    btn.type = 'button';
    btn.setAttribute('aria-label', this.messages.derived.addButtonLabel);
    btn.title = this.messages.derived.addButtonLabel;

    btn.innerHTML = `
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <line x1="8" y1="3" x2="8" y2="13"/>
        <line x1="3" y1="8" x2="13" y2="8"/>
      </svg>
    `;

    btn.addEventListener('click', this.handleClick);

    return btn;
  }

  private handleClick = (): void => {
    if (this.destroyed) return;
    this.options.onClick?.();
  };

  getElement(): HTMLElement {
    return this.element;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.element.removeEventListener('click', this.handleClick);
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
