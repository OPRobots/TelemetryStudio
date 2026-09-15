import { widgetRegistry } from './widget-registry';
import { timeSeriesChartDefinition } from './time-series-chart';
import { digitalBitmaskDefinition } from './digital-bitmask';
import { minimap2dDefinition } from './minimap-2d';
import { stateTimelineDefinition } from './state-timeline';

/**
 * Registra los 4 widgets estándar. Se llama una vez al arrancar el renderer.
 */
export function registerBuiltInWidgets(): void {
  widgetRegistry.register(timeSeriesChartDefinition);
  widgetRegistry.register(digitalBitmaskDefinition);
  widgetRegistry.register(minimap2dDefinition);
  widgetRegistry.register(stateTimelineDefinition);
}
