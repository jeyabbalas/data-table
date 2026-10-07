import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * CodeMirror editor theme that resolves every color, font, and spacing through
 * the library's `--dt-*` CSS custom properties so the editor inherits the
 * host page's palette automatically. Adapts to light/dark mode because the
 * `--dt-*` variables switch under `@media (prefers-color-scheme: dark)` /
 * `[data-dt-color-scheme="dark"]`. Pair with {@link dataTableHighlighting}
 * for SQL-token coloring; or use {@link createSqlExtensions} (which bundles
 * both by default via `includeTheme`).
 *
 * A `placeholder(...)` is painted in `--dt-text-tertiary`, which meets WCAG
 * AA in both schemes, and one wider than the editor ends in an ellipsis.
 */
export const dataTableTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
  },
  '.cm-content': {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    padding: '0.5rem',
    caretColor: 'var(--dt-text)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--dt-bg-secondary)',
  },
  // CodeMirror's own placeholder grey, #888, is 3.54:1 on a light panel,
  // and 4.14:1 in dark on the active line above (an editor that highlights
  // it): under WCAG AA's 4.5:1. The tertiary text token is 7.56:1 in light
  // and 9.57:1 in dark on `--dt-bg`, 7.23:1 and 7.92:1 on the active line.
  //
  // A hint wider than the editor (the derived-column edit panel's, 360 px)
  // ends in an ellipsis at its edge. It ran on past it, into a scroller no
  // key can scroll, as the caret never enters the hint. A width of 0 keeps
  // it from widening the content; `min-width` stretches it across the line.
  '.cm-placeholder': {
    color: 'var(--dt-text-tertiary)',
    width: '0',
    minWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--dt-primary-lighter) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--dt-text)',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
});

/**
 * Syntax highlighting style for SQL keywords, strings, numbers, comments,
 * function names, operators, type names, null, and boolean literals. Every
 * color resolves through `--dt-*` CSS custom properties, so overriding a
 * variable on `:root` or the `.dt-root` element re-themes the editor on the
 * next paint without rebuilding the extension. Pair with {@link dataTableTheme}
 * (or use {@link createSqlExtensions}, which bundles both).
 */
export const dataTableHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--dt-primary)', fontWeight: 'bold' },
    { tag: tags.string, color: 'var(--dt-syntax-string)' },
    { tag: tags.number, color: 'var(--dt-primary)' },
    { tag: tags.comment, color: 'var(--dt-text-tertiary)', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), fontWeight: 'bold' },
    { tag: tags.operator, color: 'var(--dt-text-secondary)' },
    { tag: tags.typeName, color: 'var(--dt-syntax-type)' },
    { tag: tags.null, color: 'var(--dt-text-tertiary)' },
    { tag: tags.bool, color: 'var(--dt-primary)' },
  ]),
);
