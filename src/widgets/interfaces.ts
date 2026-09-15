import type { ComponentType } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';

export type WidgetFieldType = 'number' | 'boolean' | 'array' | 'bitmask';

export type WidgetCategory = 'chart' | 'indicator' | 'spatial' | 'temporal';

/**
 * Metadatos de un widget registrado. Se usan en el panel de selección.
 */
export interface WidgetMetadata {
  /** Identificador único / nombre visible corto */
  name: string;

  /** Nombre legible para la UI */
  displayName: string;

  /** Descripción corta */
  description: string;

  /** Nombre del icono (SVG) */
  icon: string;

  /** Categoría para agrupación */
  category: WidgetCategory;

  /** Tipos de campo que acepta */
  acceptedFieldTypes: WidgetFieldType[];

  /** Tamaño mínimo en el grid (columnas x filas) */
  minSize: { width: number; height: number };

  /** Tamaño por defecto (columnas x filas) */
  defaultSize: { width: number; height: number };

  /** Configuración por defecto */
  defaultConfig: Record<string, unknown>;

  /** Orden de prioridad en la lista (menor = primero) */
  priority: number;
}

/**
 * Props que recibe todo componente de widget.
 */
export interface WidgetProps {
  widgetId: string;
  config: Record<string, unknown>;
  dataFields: string[];
  frame: TelemetryFrame | null;
  context: VideoFrameContext | null;
  /** Dataset completo del panel (primario o comparación). */
  frames: TelemetryFrame[];
}

/**
 * Definición de un widget: metadatos + componente React.
 */
export interface WidgetDefinition {
  metadata: WidgetMetadata;
  component: ComponentType<WidgetProps>;
}
