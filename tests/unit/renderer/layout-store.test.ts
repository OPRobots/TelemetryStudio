import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '@renderer/stores/layout-store';
import type { WidgetConfig } from '@core/types/layout';

function widget(id: string, width = 12, height = 6): WidgetConfig {
  return {
    id,
    type: 'TimeSeriesChart',
    label: id,
    width,
    height,
    dataFields: [],
    config: {},
    visible: true,
  };
}

describe('layout-store (rejilla de widgets)', () => {
  beforeEach(() => useLayoutStore.getState().clearWidgets());

  it('moveWidget reordena hacia delante', () => {
    const store = useLayoutStore.getState();
    store.addWidget(widget('a'));
    store.addWidget(widget('b'));
    store.addWidget(widget('c'));

    useLayoutStore.getState().moveWidget('a', 2);

    expect(useLayoutStore.getState().widgets.map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });

  it('moveWidget reordena hacia atrás', () => {
    const store = useLayoutStore.getState();
    store.addWidget(widget('a'));
    store.addWidget(widget('b'));
    store.addWidget(widget('c'));

    useLayoutStore.getState().moveWidget('c', 0);

    expect(useLayoutStore.getState().widgets.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('setWidgetWidth limita al rango [3, 12]', () => {
    useLayoutStore.getState().addWidget(widget('a'));

    useLayoutStore.getState().setWidgetWidth('a', 20);
    expect(useLayoutStore.getState().widgets[0]!.width).toBe(12);

    useLayoutStore.getState().setWidgetWidth('a', 1);
    expect(useLayoutStore.getState().widgets[0]!.width).toBe(3);

    useLayoutStore.getState().setWidgetWidth('a', 6);
    expect(useLayoutStore.getState().widgets[0]!.width).toBe(6);
  });

  it('setWidgetHeight limita al rango [2, 16]', () => {
    useLayoutStore.getState().addWidget(widget('a'));

    useLayoutStore.getState().setWidgetHeight('a', 99);
    expect(useLayoutStore.getState().widgets[0]!.height).toBe(16);

    useLayoutStore.getState().setWidgetHeight('a', 0);
    expect(useLayoutStore.getState().widgets[0]!.height).toBe(2);

    useLayoutStore.getState().setWidgetHeight('a', 5);
    expect(useLayoutStore.getState().widgets[0]!.height).toBe(5);
  });
});
