/**
 * FilterPanelField - Per-column filter control row
 *
 * Renders type-specific filter controls for a single column.
 * Supports numeric, string, boolean, date, timestamp, time, uuid, and interval types.
 * Includes a null toggle (any / is null / is not null) for all types.
 * Filters are applied explicitly via an "Apply" button or Enter key.
 * Boolean checkboxes and null radio apply immediately (single-click toggles).
 */

import type { ColumnSchema } from '../core/types';
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { Filter } from './FilterTypes';

/**
 * Options for FilterPanelField
 */
export interface FilterPanelFieldOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

/**
 * FilterPanelField renders filter controls for a single column.
 */
export class FilterPanelField {
  private element: HTMLElement;
  private controlsContainer: HTMLElement;
  private nullGroup: HTMLElement;
  private clearButton: HTMLElement;
  private destroyed = false;
  private readonly prefix: string;

  // Flag to prevent re-entrant sync when we apply our own filters
  isSelfUpdate = false;

  constructor(
    private column: ColumnSchema,
    private state: TableState,
    private actions: StateActions,
    options: FilterPanelFieldOptions = {}
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.element = this.createElement();
    this.controlsContainer = this.element.querySelector(
      `.${this.prefix}-filter-field-controls`
    )!;
    this.nullGroup = this.element.querySelector(
      `.${this.prefix}-filter-field-null`
    )!;
    this.clearButton = this.element.querySelector(
      `.${this.prefix}-filter-field-clear`
    )!;

    this.createControls();
    this.syncFromState();
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.prefix}-filter-field`;
    el.setAttribute('data-column', this.column.name);

    // Header row: name + type badge + clear button
    const header = document.createElement('div');
    header.className = `${this.prefix}-filter-field-header`;

    const name = document.createElement('span');
    name.className = `${this.prefix}-filter-field-name`;
    name.textContent = this.column.name;
    name.setAttribute('title', this.column.name);

    const type = document.createElement('span');
    type.className = `${this.prefix}-filter-field-type`;
    type.textContent = this.column.type;

    const clear = document.createElement('button');
    clear.className = `${this.prefix}-filter-field-clear ${this.prefix}-filter-field-clear--hidden`;
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      this.clearControls();
      this.removeFilter();
    });

    header.appendChild(name);
    header.appendChild(type);
    header.appendChild(clear);
    el.appendChild(header);

    // Controls container (type-specific inputs go here)
    const controls = document.createElement('div');
    controls.className = `${this.prefix}-filter-field-controls`;
    el.appendChild(controls);

    // Apply button (for non-boolean types; boolean uses immediate checkboxes)
    if (this.column.type !== 'boolean') {
      const applyBtn = document.createElement('button');
      applyBtn.className = `${this.prefix}-filter-field-apply`;
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => this.applyFilter());
      el.appendChild(applyBtn);
    }

    // Null toggle radio group
    const nullGroup = document.createElement('div');
    nullGroup.className = `${this.prefix}-filter-field-null`;

    const radioName = `null-${this.column.name}-${Math.random().toString(36).slice(2, 8)}`;
    const nullOptions: Array<{ value: string; label: string }> = [
      { value: 'any', label: 'Any' },
      { value: 'null', label: 'Is null' },
      { value: 'not-null', label: 'Is not null' },
    ];

    for (const opt of nullOptions) {
      const label = document.createElement('label');
      label.className = `${this.prefix}-filter-null-option`;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = radioName;
      radio.value = opt.value;
      if (opt.value === 'any') radio.checked = true;

      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.applyFilter();
        }
      });

      label.appendChild(radio);
      label.appendChild(document.createTextNode(opt.label));
      nullGroup.appendChild(label);
    }

    el.appendChild(nullGroup);

    return el;
  }

  // =========================================
  // Type-Specific Controls
  // =========================================

  private createControls(): void {
    const type = this.column.type;

    if (type === 'integer' || type === 'float' || type === 'decimal') {
      this.createNumericControls();
    } else if (type === 'string') {
      this.createStringControls();
    } else if (type === 'boolean') {
      this.createBooleanControls();
    } else if (type === 'date') {
      this.createDateControls('date');
    } else if (type === 'timestamp') {
      this.createDateControls('datetime-local');
    } else if (type === 'time') {
      this.createTimeControls();
    } else if (type === 'uuid') {
      this.createUuidControls();
    } else if (type === 'interval') {
      this.createIntervalControls();
    }
  }

  /**
   * Wire Enter key on an input to trigger applyFilter.
   */
  private wireEnterKey(input: HTMLInputElement): void {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyFilter();
      }
    });
  }

  private createNumericControls(): void {
    const c = this.controlsContainer;

    const select = document.createElement('select');
    select.className = `${this.prefix}-filter-select`;
    select.innerHTML = `
      <option value="between">between</option>
      <option value="eq">=</option>
      <option value="neq">!=</option>
      <option value="gt">&gt;</option>
      <option value="gte">&gt;=</option>
      <option value="lt">&lt;</option>
      <option value="lte">&lt;=</option>
    `;

    const input1 = document.createElement('input');
    input1.type = 'number';
    input1.className = `${this.prefix}-filter-input`;
    input1.placeholder = 'min';
    input1.setAttribute('step', 'any');

    const input2 = document.createElement('input');
    input2.type = 'number';
    input2.className = `${this.prefix}-filter-input`;
    input2.placeholder = 'max';
    input2.setAttribute('step', 'any');

    c.appendChild(select);
    c.appendChild(input1);
    c.appendChild(input2);

    // Toggle second input visibility based on mode
    const updateLayout = () => {
      input2.style.display = select.value === 'between' ? '' : 'none';
      input1.placeholder = select.value === 'between' ? 'min' : 'value';
    };
    updateLayout();

    select.addEventListener('change', () => updateLayout());
    this.wireEnterKey(input1);
    this.wireEnterKey(input2);
  }

  private createStringControls(): void {
    const c = this.controlsContainer;

    const select = document.createElement('select');
    select.className = `${this.prefix}-filter-select`;
    select.innerHTML = `
      <option value="contains">contains</option>
      <option value="starts">starts with</option>
      <option value="ends">ends with</option>
      <option value="regex">regex</option>
      <option value="exact">exact match</option>
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${this.prefix}-filter-input`;
    input.placeholder = 'Filter value...';

    c.appendChild(select);
    c.appendChild(input);

    this.wireEnterKey(input);
  }

  private createBooleanControls(): void {
    const c = this.controlsContainer;

    // Hide the null toggle for boolean columns — the checkboxes handle null
    this.nullGroup.style.display = 'none';

    const group = document.createElement('div');
    group.className = `${this.prefix}-filter-bool-group`;

    const options: Array<{ value: string; label: string }> = [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
      { value: 'null', label: 'Null' },
    ];

    for (const opt of options) {
      const label = document.createElement('label');
      label.className = `${this.prefix}-filter-bool-option`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = opt.value;
      checkbox.checked = true; // All checked by default (no filter)

      // Boolean checkboxes apply immediately (single-click toggles)
      checkbox.addEventListener('change', () => this.applyFilter());

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(opt.label));
      group.appendChild(label);
    }

    c.appendChild(group);
  }

  private createDateControls(inputType: 'date' | 'datetime-local'): void {
    const c = this.controlsContainer;

    const select = document.createElement('select');
    select.className = `${this.prefix}-filter-select`;
    select.innerHTML = `
      <option value="between">between</option>
      <option value="eq">=</option>
      <option value="before">before</option>
      <option value="on-or-before">on or before</option>
      <option value="after">after</option>
      <option value="on-or-after">on or after</option>
    `;

    const input1 = document.createElement('input');
    input1.type = inputType;
    input1.className = `${this.prefix}-filter-input`;

    const input2 = document.createElement('input');
    input2.type = inputType;
    input2.className = `${this.prefix}-filter-input`;

    c.appendChild(select);
    c.appendChild(input1);
    c.appendChild(input2);

    const updateLayout = () => {
      input2.style.display = select.value === 'between' ? '' : 'none';
    };
    updateLayout();

    select.addEventListener('change', () => updateLayout());
  }

  private createTimeControls(): void {
    const c = this.controlsContainer;

    const label1 = document.createElement('span');
    label1.className = `${this.prefix}-filter-field-label`;
    label1.textContent = 'From';

    const input1 = document.createElement('input');
    input1.type = 'time';
    input1.className = `${this.prefix}-filter-input`;

    const label2 = document.createElement('span');
    label2.className = `${this.prefix}-filter-field-label`;
    label2.textContent = 'To';

    const input2 = document.createElement('input');
    input2.type = 'time';
    input2.className = `${this.prefix}-filter-input`;

    c.appendChild(label1);
    c.appendChild(input1);
    c.appendChild(label2);
    c.appendChild(input2);
  }

  private createUuidControls(): void {
    const c = this.controlsContainer;

    const select = document.createElement('select');
    select.className = `${this.prefix}-filter-select`;
    select.innerHTML = `
      <option value="contains">contains</option>
      <option value="exact">exact match</option>
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${this.prefix}-filter-input`;
    input.placeholder = 'UUID value...';

    c.appendChild(select);
    c.appendChild(input);

    this.wireEnterKey(input);
  }

  private createIntervalControls(): void {
    const c = this.controlsContainer;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${this.prefix}-filter-input`;
    input.placeholder = 'Contains...';

    c.appendChild(input);

    this.wireEnterKey(input);
  }

  // =========================================
  // Filter Building & Application
  // =========================================

  applyFilter(): void {
    if (this.destroyed) return;

    // Check null toggle first (for non-boolean types)
    const nullValue = this.getNullToggleValue();
    if (nullValue === 'null') {
      this.setFilter({ type: 'null', column: this.column.name });
      return;
    }
    if (nullValue === 'not-null') {
      this.setFilter({ type: 'not-null', column: this.column.name });
      return;
    }

    // Build type-specific filter
    const filter = this.buildTypeFilter();
    if (filter) {
      this.setFilter(filter);
    } else {
      this.removeFilter();
    }
  }

  private setFilter(filter: Filter): void {
    this.isSelfUpdate = true;
    this.actions.addFilter(filter);
    queueMicrotask(() => { this.isSelfUpdate = false; });
    this.updateClearButton(true);
  }

  private removeFilter(): void {
    this.isSelfUpdate = true;
    this.actions.removeFilter(this.column.name);
    queueMicrotask(() => { this.isSelfUpdate = false; });
    this.updateClearButton(false);
  }

  private updateClearButton(hasFilter: boolean): void {
    this.clearButton.classList.toggle(
      `${this.prefix}-filter-field-clear--hidden`,
      !hasFilter
    );
  }

  private getNullToggleValue(): string {
    const radios = this.nullGroup.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
    for (const radio of radios) {
      if (radio.checked) return radio.value;
    }
    return 'any';
  }

  private buildTypeFilter(): Filter | null {
    const type = this.column.type;

    if (type === 'integer' || type === 'float' || type === 'decimal') {
      return this.buildNumericFilter();
    } else if (type === 'string') {
      return this.buildStringFilter();
    } else if (type === 'boolean') {
      return this.buildBooleanFilter();
    } else if (type === 'date' || type === 'timestamp') {
      return this.buildDateFilter();
    } else if (type === 'time') {
      return this.buildTimeFilter();
    } else if (type === 'uuid') {
      return this.buildUuidFilter();
    } else if (type === 'interval') {
      return this.buildIntervalFilter();
    }
    return null;
  }

  private buildNumericFilter(): Filter | null {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const inputs = this.controlsContainer.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
    const mode = select.value;
    const val1 = inputs[0]?.value.trim();
    const val2 = inputs[1]?.value.trim();

    if (!val1) return null;
    const num1 = parseFloat(val1);
    if (isNaN(num1)) return null;

    const col = this.column.name;

    switch (mode) {
      case 'between': {
        if (!val2) return null;
        const num2 = parseFloat(val2);
        if (isNaN(num2)) return null;
        // Allow min > max — DuckDB will correctly return 0 rows
        return { type: 'range', column: col, min: num1, max: num2 };
      }
      case 'eq':
        return { type: 'point', column: col, value: num1 };
      case 'neq':
        return { type: 'not-set', column: col, values: [num1] };
      case 'gt':
        return { type: 'range', column: col, min: num1, max: Infinity, minExclusive: true };
      case 'gte':
        return { type: 'range', column: col, min: num1, max: Infinity };
      case 'lt':
        return { type: 'range', column: col, min: -Infinity, max: num1 };
      case 'lte':
        return { type: 'range', column: col, min: -Infinity, max: num1, maxInclusive: true };
      default:
        return null;
    }
  }

  private buildStringFilter(): Filter | null {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    const mode = select.value;
    const value = input.value;

    if (!value) return null;

    const col = this.column.name;

    if (mode === 'exact') {
      return { type: 'point', column: col, value };
    }
    return {
      type: 'pattern',
      column: col,
      pattern: value,
      mode: mode as 'contains' | 'starts' | 'ends' | 'regex',
    };
  }

  private buildBooleanFilter(): Filter | null {
    const checkboxes = this.controlsContainer.querySelectorAll(
      'input[type="checkbox"]'
    ) as NodeListOf<HTMLInputElement>;
    const trueChecked = checkboxes[0]?.checked ?? false;
    const falseChecked = checkboxes[1]?.checked ?? false;
    const nullChecked = checkboxes[2]?.checked ?? false;

    const col = this.column.name;

    // All checked or none checked = no filter
    if ((trueChecked && falseChecked && nullChecked) || (!trueChecked && !falseChecked && !nullChecked)) {
      return null;
    }

    // Single selections
    if (trueChecked && !falseChecked && !nullChecked) {
      return { type: 'point', column: col, value: true };
    }
    if (!trueChecked && falseChecked && !nullChecked) {
      return { type: 'point', column: col, value: false };
    }
    if (!trueChecked && !falseChecked && nullChecked) {
      return { type: 'null', column: col };
    }

    // Two of three selected — exclude the unselected
    if (trueChecked && falseChecked && !nullChecked) {
      return { type: 'not-null', column: col };
    }
    if (trueChecked && !falseChecked && nullChecked) {
      // Exclude false
      return { type: 'not-set', column: col, values: [false] };
    }
    if (!trueChecked && falseChecked && nullChecked) {
      // Exclude true
      return { type: 'not-set', column: col, values: [true] };
    }

    return null;
  }

  private buildDateFilter(): Filter | null {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const inputs = this.controlsContainer.querySelectorAll(
      'input[type="date"], input[type="datetime-local"]'
    ) as NodeListOf<HTMLInputElement>;
    const mode = select.value;
    const val1 = inputs[0]?.value;
    const val2 = inputs[1]?.value;

    if (!val1) return null;

    const col = this.column.name;

    switch (mode) {
      case 'between': {
        if (!val2) return null;
        return { type: 'range', column: col, min: val1, max: val2 };
      }
      case 'eq':
        return { type: 'point', column: col, value: val1 };
      case 'before':
        return { type: 'range', column: col, min: -Infinity, max: val1 };
      case 'on-or-before':
        return { type: 'range', column: col, min: -Infinity, max: val1, maxInclusive: true };
      case 'after':
        return { type: 'range', column: col, min: val1, max: Infinity, minExclusive: true };
      case 'on-or-after':
        return { type: 'range', column: col, min: val1, max: Infinity };
      default:
        return null;
    }
  }

  private buildTimeFilter(): Filter | null {
    const inputs = this.controlsContainer.querySelectorAll(
      'input[type="time"]'
    ) as NodeListOf<HTMLInputElement>;
    const val1 = inputs[0]?.value;
    const val2 = inputs[1]?.value;

    if (!val1 && !val2) return null;

    const col = this.column.name;

    if (val1 && val2) {
      return { type: 'range', column: col, min: val1, max: val2 };
    }
    if (val1 && !val2) {
      return { type: 'range', column: col, min: val1, max: Infinity };
    }
    // !val1 && val2
    return { type: 'range', column: col, min: -Infinity, max: val2 };
  }

  private buildUuidFilter(): Filter | null {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    const mode = select.value;
    const value = input.value;

    if (!value) return null;

    const col = this.column.name;

    if (mode === 'exact') {
      return { type: 'point', column: col, value };
    }
    return { type: 'pattern', column: col, pattern: value, mode: 'contains' };
  }

  private buildIntervalFilter(): Filter | null {
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    const value = input.value;

    if (!value) return null;

    return { type: 'pattern', column: this.column.name, pattern: value, mode: 'contains' };
  }

  // =========================================
  // State Synchronization
  // =========================================

  /**
   * Sync control values from current filter state.
   * Called on construction and when filters change externally.
   */
  syncFromState(): void {
    const filters = this.state.filtersByColumn.get().get(this.column.name);
    if (!filters || filters.length === 0) {
      this.clearControls();
      this.updateClearButton(false);
      return;
    }

    const filter = filters[0]; // One filter per column
    this.populateFromFilter(filter);
    this.updateClearButton(true);
  }

  private populateFromFilter(filter: Filter): void {
    const type = this.column.type;

    // Handle null filters for non-boolean types
    if ((filter.type === 'null' || filter.type === 'not-null') && type !== 'boolean') {
      this.setNullToggle(filter.type);
      return;
    }

    // Reset null toggle to "any" for value-based filters
    if (type !== 'boolean') {
      this.setNullToggle('any');
    }

    if (type === 'integer' || type === 'float' || type === 'decimal') {
      this.populateNumericFromFilter(filter);
    } else if (type === 'string') {
      this.populateStringFromFilter(filter);
    } else if (type === 'boolean') {
      this.populateBooleanFromFilter(filter);
    } else if (type === 'date' || type === 'timestamp') {
      this.populateDateFromFilter(filter);
    } else if (type === 'time') {
      this.populateTimeFromFilter(filter);
    } else if (type === 'uuid') {
      this.populateUuidFromFilter(filter);
    } else if (type === 'interval') {
      this.populateIntervalFromFilter(filter);
    }
  }

  private setNullToggle(value: string): void {
    const radios = this.nullGroup.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
    for (const radio of radios) {
      radio.checked = radio.value === value;
    }
  }

  private populateNumericFromFilter(filter: Filter): void {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const inputs = this.controlsContainer.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
    if (!select || inputs.length < 2) return;

    if (filter.type === 'range') {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

      if (!minIsOpen && !maxIsOpen) {
        select.value = 'between';
        inputs[0].value = String(filter.min);
        inputs[1].value = String(filter.max);
        inputs[1].style.display = '';
        inputs[0].placeholder = 'min';
      } else if (maxIsOpen && !minIsOpen) {
        select.value = filter.minExclusive ? 'gt' : 'gte';
        inputs[0].value = String(filter.min);
        inputs[1].style.display = 'none';
        inputs[0].placeholder = 'value';
      } else if (minIsOpen && !maxIsOpen) {
        select.value = filter.maxInclusive ? 'lte' : 'lt';
        inputs[0].value = String(filter.max);
        inputs[1].style.display = 'none';
        inputs[0].placeholder = 'value';
      }
    } else if (filter.type === 'point') {
      select.value = 'eq';
      inputs[0].value = String(filter.value);
      inputs[1].style.display = 'none';
      inputs[0].placeholder = 'value';
    } else if (filter.type === 'not-set' && filter.values.length === 1) {
      select.value = 'neq';
      inputs[0].value = String(filter.values[0]);
      inputs[1].style.display = 'none';
      inputs[0].placeholder = 'value';
    }
  }

  private populateStringFromFilter(filter: Filter): void {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    if (!select || !input) return;

    if (filter.type === 'pattern') {
      select.value = filter.mode;
      input.value = filter.pattern;
    } else if (filter.type === 'point') {
      select.value = 'exact';
      input.value = String(filter.value ?? '');
    }
  }

  private populateBooleanFromFilter(filter: Filter): void {
    const checkboxes = this.controlsContainer.querySelectorAll(
      'input[type="checkbox"]'
    ) as NodeListOf<HTMLInputElement>;
    if (checkboxes.length < 3) return;

    // Default: all checked
    checkboxes[0].checked = true;
    checkboxes[1].checked = true;
    checkboxes[2].checked = true;

    if (filter.type === 'point') {
      if (filter.value === true) {
        checkboxes[0].checked = true;
        checkboxes[1].checked = false;
        checkboxes[2].checked = false;
      } else if (filter.value === false) {
        checkboxes[0].checked = false;
        checkboxes[1].checked = true;
        checkboxes[2].checked = false;
      }
    } else if (filter.type === 'null') {
      checkboxes[0].checked = false;
      checkboxes[1].checked = false;
      checkboxes[2].checked = true;
    } else if (filter.type === 'not-null') {
      checkboxes[0].checked = true;
      checkboxes[1].checked = true;
      checkboxes[2].checked = false;
    } else if (filter.type === 'not-set') {
      // Exclude specific values
      const excluded = new Set(filter.values.map(String));
      checkboxes[0].checked = !excluded.has('true');
      checkboxes[1].checked = !excluded.has('false');
      // null is checked if it's not excluded via not-null
      checkboxes[2].checked = true;
    }
  }

  private populateDateFromFilter(filter: Filter): void {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const inputs = this.controlsContainer.querySelectorAll(
      'input[type="date"], input[type="datetime-local"]'
    ) as NodeListOf<HTMLInputElement>;
    if (!select || inputs.length < 2) return;

    if (filter.type === 'range') {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min as number);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max as number);

      if (!minIsOpen && !maxIsOpen) {
        select.value = 'between';
        inputs[0].value = String(filter.min);
        inputs[1].value = String(filter.max);
        inputs[1].style.display = '';
      } else if (maxIsOpen && !minIsOpen) {
        select.value = filter.minExclusive ? 'after' : 'on-or-after';
        inputs[0].value = String(filter.min);
        inputs[1].style.display = 'none';
      } else if (minIsOpen && !maxIsOpen) {
        select.value = filter.maxInclusive ? 'on-or-before' : 'before';
        inputs[0].value = String(filter.max);
        inputs[1].style.display = 'none';
      }
    } else if (filter.type === 'point') {
      select.value = 'eq';
      inputs[0].value = String(filter.value ?? '');
      inputs[1].style.display = 'none';
    }
  }

  private populateTimeFromFilter(filter: Filter): void {
    const inputs = this.controlsContainer.querySelectorAll(
      'input[type="time"]'
    ) as NodeListOf<HTMLInputElement>;
    if (inputs.length < 2) return;

    if (filter.type === 'range') {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min as number);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max as number);

      inputs[0].value = minIsOpen ? '' : String(filter.min);
      inputs[1].value = maxIsOpen ? '' : String(filter.max);
    }
  }

  private populateUuidFromFilter(filter: Filter): void {
    const select = this.controlsContainer.querySelector('select') as HTMLSelectElement;
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    if (!select || !input) return;

    if (filter.type === 'point') {
      select.value = 'exact';
      input.value = String(filter.value ?? '');
    } else if (filter.type === 'pattern') {
      select.value = 'contains';
      input.value = filter.pattern;
    }
  }

  private populateIntervalFromFilter(filter: Filter): void {
    const input = this.controlsContainer.querySelector('input[type="text"]') as HTMLInputElement;
    if (!input) return;

    if (filter.type === 'pattern') {
      input.value = filter.pattern;
    }
  }

  // =========================================
  // Control Reset
  // =========================================

  clearControls(): void {
    // Reset all inputs
    const inputs = this.controlsContainer.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    for (const input of inputs) {
      if (input.type === 'checkbox') {
        input.checked = true; // Boolean: all checked = no filter
      } else {
        input.value = '';
      }
    }

    // Reset selects to first option
    const selects = this.controlsContainer.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    for (const select of selects) {
      select.selectedIndex = 0;
    }

    // Reset numeric layout (show second input for 'between')
    if (this.column.type === 'integer' || this.column.type === 'float' || this.column.type === 'decimal') {
      const numInputs = this.controlsContainer.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      if (numInputs[0]) numInputs[0].placeholder = 'min';
      if (numInputs[1]) numInputs[1].style.display = '';
    }

    // Reset date layout
    if (this.column.type === 'date' || this.column.type === 'timestamp') {
      const dateInputs = this.controlsContainer.querySelectorAll(
        'input[type="date"], input[type="datetime-local"]'
      ) as NodeListOf<HTMLInputElement>;
      if (dateInputs[1]) dateInputs[1].style.display = '';
    }

    // Reset null toggle to "any"
    this.setNullToggle('any');
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Highlight this field (scroll into view + flash)
   */
  highlight(): void {
    this.element.classList.add(`${this.prefix}-filter-field--highlighted`);
    setTimeout(() => {
      this.element.classList.remove(`${this.prefix}-filter-field--highlighted`);
    }, 2000);
  }

  /**
   * Get the column name
   */
  getColumnName(): string {
    return this.column.name;
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
