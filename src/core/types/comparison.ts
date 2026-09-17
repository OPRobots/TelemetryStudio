/**
 * Resultado de la validación de compatibilidad de widgets.
 */
export interface WidgetCompatibilityResult {
  compatible: boolean;
  differences: string[];
  sessionAWidgets: import('./session').SessionWidget[];
  sessionBWidgets: import('./session').SessionWidget[];
}
