import type { TelemetryDataset } from './telemetry';

/**
 * Configuración para el modo de comparación side-by-side.
 */
export interface ComparisonConfig {
  enabled: boolean;
  referenceDataset: TelemetryDataset | null;
  referenceVideoPath: string | null;
  referenceSync: { offset_ms: number; anchor: [number, number] | null; rate: number } | null;
  referenceLayout: { widgets: import('./session').SessionWidget[] } | null;
}

/**
 * Resultado de la validación de compatibilidad de widgets.
 */
export interface WidgetCompatibilityResult {
  compatible: boolean;
  differences: string[];
  sessionAWidgets: import('./session').SessionWidget[];
  sessionBWidgets: import('./session').SessionWidget[];
}
