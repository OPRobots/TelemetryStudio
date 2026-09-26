import { describe, it, expect, beforeEach } from 'vitest';
import { LayoutManager, createEmptyLayout } from '@services/layout-manager';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';

class MockPersistence {
  saved = new Map<string, DashboardLayout>();
  async save(layout: DashboardLayout): Promise<void> {
    this.saved.set(layout.name, layout);
  }
  async loadAll(): Promise<DashboardLayout[]> {
    return Array.from(this.saved.values());
  }
  async remove(name: string): Promise<void> {
    this.saved.delete(name);
  }
}

function makeWidget(id: string): WidgetConfig {
  return {
    id,
    type: 'TimeSeriesChart',
    label: 'Chart',
    width: 12,
    height: 6,
    dataFields: ['speed'],
    config: {},
    visible: true,
  };
}

describe('LayoutManager', () => {
  let manager: LayoutManager;
  let persistence: MockPersistence;

  beforeEach(() => {
    persistence = new MockPersistence();
    manager = new LayoutManager(persistence);
  });

  it('starts with no saved layouts', () => {
    expect(manager.getAllLayouts()).toHaveLength(0);
  });

  it('creates a new empty layout', () => {
    const layout = manager.createNew('Mi layout');
    expect(layout.name).toBe('Mi layout');
    expect(layout.widgets).toHaveLength(0);
    expect(manager.getCurrentLayout()?.name).toBe('Mi layout');
  });

  it('adds, updates and removes widgets', () => {
    manager.createNew('Test');
    manager.addWidget(makeWidget('w1'));
    expect(manager.getCurrentLayout()?.widgets).toHaveLength(1);

    manager.updateWidget('w1', { label: 'Updated' });
    expect(manager.getCurrentLayout()?.widgets[0]?.label).toBe('Updated');

    manager.removeWidget('w1');
    expect(manager.getCurrentLayout()?.widgets).toHaveLength(0);
  });

  it('saves the current layout through persistence', async () => {
    manager.createNew('Persisted');
    manager.addWidget(makeWidget('w1'));
    await manager.saveLayout('Persisted');

    expect(persistence.saved.has('Persisted')).toBe(true);
    expect(manager.getSavedLayouts().some((l) => l.name === 'Persisted')).toBe(true);
  });

  it('persists the layout description', async () => {
    manager.createNew('Con descripción', 'IR + PWM');
    await manager.saveLayout('Con descripción');

    expect(persistence.saved.get('Con descripción')?.description).toBe('IR + PWM');
  });

  it('preserves createdAt when overwriting a layout', async () => {
    manager.createNew('Durable');
    await manager.saveLayout('Durable');
    const firstCreatedAt = manager.getSavedLayouts()[0]?.createdAt;

    await new Promise((r) => setTimeout(r, 5));
    await manager.saveLayout('Durable');
    const secondCreatedAt = manager.getSavedLayouts()[0]?.createdAt;

    expect(secondCreatedAt).toBe(firstCreatedAt);
  });

  it('loads a layout as current', () => {
    const layout = createEmptyLayout('Cargado');
    manager.loadLayout(layout);
    expect(manager.getCurrentLayout()?.name).toBe('Cargado');
  });

  it('deletes a saved layout', async () => {
    manager.createNew('ToDelete');
    await manager.saveLayout('ToDelete');
    await manager.deleteLayout('ToDelete');
    expect(manager.getSavedLayouts().some((l) => l.name === 'ToDelete')).toBe(false);
  });

  it('refreshes saved layouts from persistence', async () => {
    await persistence.save(createEmptyLayout('Remote'));
    await manager.refreshSavedLayouts();
    expect(manager.getSavedLayouts().some((l) => l.name === 'Remote')).toBe(true);
  });

  it('createEmptyLayout returns a valid default structure', () => {
    const layout = createEmptyLayout('X', 'desc');
    expect(layout.version).toBe(1);
    expect(layout.description).toBe('desc');
    expect(layout.global.theme).toBe('dark');
  });

  it('createEmptyLayout includes default panel sizes', () => {
    const layout = createEmptyLayout('X');
    expect(layout.panels.inspectorWidth).toBe(288);
    expect(layout.panels.inspectorVisible).toBe(true);
    expect(layout.panels.videoRatio).toBeCloseTo(0.42);
    expect(layout.panels.comparisonRatio).toBeCloseTo(0.5);
  });
});
