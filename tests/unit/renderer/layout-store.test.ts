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

  it('addFieldToWidget añade el campo y evita duplicados', () => {
    const store = useLayoutStore.getState();
    store.addWidget({ ...widget('a'), dataFields: ['speed'] });

    useLayoutStore.getState().addFieldToWidget('a', 'battery');
    expect(useLayoutStore.getState().widgets[0]!.dataFields).toEqual(['speed', 'battery']);

    useLayoutStore.getState().addFieldToWidget('a', 'speed');
    expect(useLayoutStore.getState().widgets[0]!.dataFields).toEqual(['speed', 'battery']);
  });

  it('addFieldToWidget extiende los colores existentes', () => {
    useLayoutStore
      .getState()
      .addWidget({ ...widget('a'), dataFields: ['speed'], config: { colors: ['#111111'] } });

    useLayoutStore.getState().addFieldToWidget('a', 'battery');
    expect(useLayoutStore.getState().widgets[0]!.config.colors).toEqual(['#111111', '#F2BE22']);
  });

  it('mergeWidgets fusiona campos, conserva colores del destino y elimina el origen', () => {
    const store = useLayoutStore.getState();
    store.addWidget({
      ...widget('src'),
      label: 'origen',
      dataFields: ['b', 'c'],
      config: { colors: ['#222222', '#333333'] },
    });
    store.addWidget({
      ...widget('dst'),
      label: 'destino',
      dataFields: ['a'],
      config: { colors: ['#111111'] },
    });

    useLayoutStore.getState().mergeWidgets('src', 'dst');

    const widgets = useLayoutStore.getState().widgets;
    expect(widgets.map((w) => w.id)).toEqual(['dst']);
    expect(widgets[0]!.dataFields).toEqual(['a', 'b', 'c']);
    expect(widgets[0]!.config.colors).toEqual(['#111111', '#F2BE22', '#22c55e']);
  });

  it('mergeWidgets dedupe campos ya presentes', () => {
    const store = useLayoutStore.getState();
    store.addWidget({ ...widget('src'), dataFields: ['a', 'b'] });
    store.addWidget({ ...widget('dst'), dataFields: ['a'] });

    useLayoutStore.getState().mergeWidgets('src', 'dst');

    expect(useLayoutStore.getState().widgets[0]!.dataFields).toEqual(['a', 'b']);
  });

  it('mergeWidgets no hace nada si no son TimeSeriesChart', () => {
    const store = useLayoutStore.getState();
    store.addWidget({ ...widget('src'), type: 'DigitalBitmask' });
    store.addWidget({ ...widget('dst') });

    useLayoutStore.getState().mergeWidgets('src', 'dst');

    expect(useLayoutStore.getState().widgets.map((w) => w.id)).toEqual(['src', 'dst']);
  });
});
