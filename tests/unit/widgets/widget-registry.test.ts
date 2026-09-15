import { describe, it, expect, beforeEach } from 'vitest';
import { WidgetRegistry } from '@widgets/widget-registry';
import type { WidgetDefinition, WidgetFieldType, WidgetCategory } from '@widgets/interfaces';

function makeDefinition(
  name: string,
  actionTypes: WidgetFieldType[],
  priority: number,
  category: WidgetCategory = 'chart'
): WidgetDefinition {
  return {
    metadata: {
      name,
      displayName: name,
      description: `${name} widget`,
      icon: 'square',
      category,
      acceptedFieldTypes: actionTypes,
      minSize: { width: 2, height: 2 },
      defaultSize: { width: 4, height: 4 },
      defaultConfig: {},
      priority,
    },
    component: () => null,
  };
}

describe('WidgetRegistry', () => {
  let registry: WidgetRegistry;

  beforeEach(() => {
    registry = new WidgetRegistry();
  });

  it('registers and retrieves widgets', () => {
    registry.register(makeDefinition('Chart', ['number'], 10));
    expect(registry.get('Chart')?.metadata.name).toBe('Chart');
  });

  it('sorts widgets by priority', () => {
    registry.register(makeDefinition('B', ['number'], 20));
    registry.register(makeDefinition('A', ['number'], 10));
    expect(registry.getAll().map((w) => w.metadata.name)).toEqual(['A', 'B']);
  });

  it('filters by field type', () => {
    registry.register(makeDefinition('Chart', ['number'], 10));
    registry.register(makeDefinition('Bits', ['bitmask'], 20));
    expect(registry.getByFieldType('bitmask').map((w) => w.metadata.name)).toEqual(['Bits']);
  });

  it('filters by category', () => {
    registry.register(makeDefinition('Chart', ['number'], 10, 'chart'));
    registry.register(makeDefinition('Map', ['number'], 20, 'spatial'));
    expect(registry.getByCategory('spatial').map((w) => w.metadata.name)).toEqual(['Map']);
  });

  it('recommends the highest priority widget for a field type', () => {
    registry.register(makeDefinition('Low', ['number'], 50));
    registry.register(makeDefinition('High', ['number'], 10));
    expect(registry.getRecommendedFor('number')?.metadata.name).toBe('High');
  });

  it('unregisters widgets', () => {
    registry.register(makeDefinition('Chart', ['number'], 10));
    registry.unregister('Chart');
    expect(registry.get('Chart')).toBeUndefined();
  });

  it('overwrites duplicates without duplicating entries', () => {
    registry.register(makeDefinition('Chart', ['number'], 10));
    registry.register(makeDefinition('Chart', ['number'], 10));
    expect(registry.getAll()).toHaveLength(1);
  });

  it('destroys all widgets', () => {
    registry.register(makeDefinition('Chart', ['number'], 10));
    registry.destroyAll();
    expect(registry.getAll()).toHaveLength(0);
  });
});
