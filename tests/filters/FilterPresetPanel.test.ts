/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilterPresetPanel } from '@/filters/FilterPresetPanel';
import { FilterPresetManager } from '@/filters/FilterPresets';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { StateActions } from '@/core/Actions';
import type { Filter } from '@/filters/FilterTypes';

// --- Helpers ---

function createMockActions(): StateActions {
  return {
    loadFilterPreset: vi.fn(),
  } as unknown as StateActions;
}

function rangeFilter(column = 'price'): Filter {
  return { type: 'range', column, min: 0, max: 100 };
}

describe('FilterPresetPanel', () => {
  let state: TableState;
  let actions: StateActions;
  let manager: FilterPresetManager;
  let panel: FilterPresetPanel;
  let anchor: HTMLElement;

  beforeEach(() => {
    state = createTableState();
    actions = createMockActions();
    manager = new FilterPresetManager();
    panel = new FilterPresetPanel(manager, state, actions);

    anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({
      top: 100, left: 50, bottom: 130, right: 150, width: 100, height: 30,
      x: 50, y: 100, toJSON: () => {},
    });

    // Panel needs a parent for positioning
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 600, right: 800, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => {},
    });
    container.appendChild(panel.getElement());
    document.body.appendChild(container);
  });

  afterEach(() => {
    panel.destroy();
    document.body.innerHTML = '';
  });

  // ==========================================
  // Open / Close / Toggle
  // ==========================================

  describe('open/close/toggle', () => {
    it('opens and shows the panel', () => {
      panel.toggle(anchor);
      expect(panel.getIsOpen()).toBe(true);
      expect(panel.getElement().style.display).not.toBe('none');
    });

    it('closes the panel', () => {
      panel.toggle(anchor);
      panel.close();
      expect(panel.getIsOpen()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('toggles between open and closed', () => {
      panel.toggle(anchor);
      expect(panel.getIsOpen()).toBe(true);
      panel.toggle(anchor);
      expect(panel.getIsOpen()).toBe(false);
    });

    it('closes on Escape key', async () => {
      panel.toggle(anchor);
      // Close handlers are registered inside requestAnimationFrame
      await new Promise(resolve => requestAnimationFrame(resolve));
      // ModalHost scopes the keydown listener to the panel element.
      panel
        .getElement()
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Save
  // ==========================================

  describe('save', () => {
    it('save button is disabled when no filters', () => {
      panel.toggle(anchor);
      const nameInput = panel.getElement().querySelector('input[type="text"]') as HTMLInputElement;
      nameInput.value = 'Test';
      nameInput.dispatchEvent(new Event('input'));

      const saveBtn = panel.getElement().querySelector('[class$="filter-preset-save-btn"]') as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(true);
    });

    it('save button is disabled when no name', () => {
      state.filters.set([rangeFilter()]);
      panel.toggle(anchor);

      const saveBtn = panel.getElement().querySelector('[class$="filter-preset-save-btn"]') as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(true);
    });

    it('save button is enabled when both name and filters present', () => {
      state.filters.set([rangeFilter()]);
      panel.toggle(anchor);

      const nameInput = panel.getElement().querySelector('input[type="text"]') as HTMLInputElement;
      nameInput.value = 'Test';
      nameInput.dispatchEvent(new Event('input'));

      const saveBtn = panel.getElement().querySelector('[class$="filter-preset-save-btn"]') as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(false);
    });

    it('creates preset and clears inputs', () => {
      state.filters.set([rangeFilter()]);
      panel.toggle(anchor);

      const nameInput = panel.getElement().querySelector('input[type="text"]') as HTMLInputElement;
      nameInput.value = 'My Preset';
      nameInput.dispatchEvent(new Event('input'));

      const saveBtn = panel.getElement().querySelector('[class$="filter-preset-save-btn"]') as HTMLButtonElement;
      saveBtn?.click();

      expect(manager.getPresets()).toHaveLength(1);
      expect(manager.getPresets()[0].name).toBe('My Preset');
      expect(nameInput.value).toBe('');
    });
  });

  // ==========================================
  // Load
  // ==========================================

  describe('load', () => {
    it('calls presetManager.load and closes panel', () => {
      state.filters.set([rangeFilter()]);
      manager.save('P', [rangeFilter()]);

      panel.toggle(anchor);

      const loadBtn = panel.getElement().querySelector('[class$="filter-preset-action-btn--load"]') as HTMLButtonElement;
      loadBtn?.click();

      expect(actions.loadFilterPreset).toHaveBeenCalled();
      expect(panel.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Delete with confirmation
  // ==========================================

  describe('delete', () => {
    it('shows confirmation on Delete click', () => {
      manager.save('P', [rangeFilter()]);
      panel.toggle(anchor);

      const deleteBtn = panel.getElement().querySelector('[class$="filter-preset-action-btn--delete"]') as HTMLButtonElement;
      deleteBtn?.click();

      const confirmDiv = panel.getElement().querySelector('[class$="filter-preset-delete-confirm"]') as HTMLElement;
      expect(confirmDiv?.style.display).toBe('flex');
      expect(deleteBtn?.style.display).toBe('none');
    });

    it('Yes button confirms deletion', () => {
      manager.save('P', [rangeFilter()]);
      panel.toggle(anchor);

      // Click Delete, then Yes
      const deleteBtn = panel.getElement().querySelector('[class$="filter-preset-action-btn--delete"]') as HTMLButtonElement;
      deleteBtn?.click();

      // The Yes button is the second .dt-filter-preset-action-btn--delete in the confirm div
      const confirmDiv = panel.getElement().querySelector('[class$="filter-preset-delete-confirm"]') as HTMLElement;
      const yesBtn = confirmDiv?.querySelectorAll('button')[0] as HTMLButtonElement;
      yesBtn?.click();

      expect(manager.getPresets()).toHaveLength(0);
    });

    it('No button cancels deletion', () => {
      manager.save('P', [rangeFilter()]);
      panel.toggle(anchor);

      const deleteBtn = panel.getElement().querySelector('[class$="filter-preset-action-btn--delete"]') as HTMLButtonElement;
      deleteBtn?.click();

      const confirmDiv = panel.getElement().querySelector('[class$="filter-preset-delete-confirm"]') as HTMLElement;
      const noBtn = confirmDiv?.querySelectorAll('button')[1] as HTMLButtonElement;
      noBtn?.click();

      expect(manager.getPresets()).toHaveLength(1);
      expect(confirmDiv?.style.display).toBe('none');
      expect(deleteBtn?.style.display).toBe('');
    });
  });

  // ==========================================
  // Export
  // ==========================================

  describe('export', () => {
    it('export button is disabled when no presets', () => {
      panel.toggle(anchor);
      const exportBtn = panel.getElement().querySelectorAll('[class$="filter-preset-io-btn"]')[0] as HTMLButtonElement;
      expect(exportBtn?.disabled).toBe(true);
    });

    it('export button is enabled when presets exist', () => {
      manager.save('P', [rangeFilter()]);
      panel.toggle(anchor);
      const exportBtn = panel.getElement().querySelectorAll('[class$="filter-preset-io-btn"]')[0] as HTMLButtonElement;
      expect(exportBtn?.disabled).toBe(false);
    });
  });

  // ==========================================
  // Reactive updates
  // ==========================================

  describe('reactive updates', () => {
    it('re-renders list when presets change', () => {
      panel.toggle(anchor);
      // Initially empty
      const emptyMsg = panel.getElement().querySelector('[class$="filter-preset-empty"]');
      expect(emptyMsg?.textContent).toContain('No saved presets');

      // Save a preset — list should update reactively
      manager.save('P1', [rangeFilter()]);

      const items = panel.getElement().querySelectorAll('[class$="filter-preset-item"]');
      expect(items).toHaveLength(1);
    });
  });

  // ==========================================
  // Destroy
  // ==========================================

  describe('destroy', () => {
    it('unsubscribes from signals', () => {
      panel.destroy();
      // Should not throw when presets change after destroy
      expect(() => manager.save('P', [rangeFilter()])).not.toThrow();
    });

    it('removes element from DOM', () => {
      const parent = panel.getElement().parentNode;
      panel.destroy();
      expect(parent?.contains(panel.getElement())).toBe(false);
    });
  });
});
