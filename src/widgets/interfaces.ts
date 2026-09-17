import type { ComponentType } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';
import type { ZoomRange } from './zoom-range';

export type WidgetFieldType = 'number' | 'boolean' | 'string' | 'array' | 'bitmask';

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

  /**
   * Timestamp efectivo a visualizar (ms): hover sobre la gráfica temporal >
   * posición del vídeo > último frame disponible. `null` si no hay datos.
   */
  viewTimestamp_ms?: number | null;

  /**
   * Publica el timestamp bajo el cursor de una gráfica (hover) o `null` al
   * salir. Lo emiten la gráfica temporal y la StateTimeline.
   */
  onCursorHover?: (timestamp_ms: number | null) => void;

  /** Rango de zoom compartido entre timelines; `null` = vista completa. */
  zoomRange?: ZoomRange | null;

  /** Publica el rango de zoom (o `null` al restablecer). */
  onZoomRangeChange?: (range: ZoomRange | null) => void;
}

/**
 * Definición de un widget: metadatos + componente React.
 */
export interface WidgetDefinition {
  metadata: WidgetMetadata;
  component: ComponentType<WidgetProps>;
}
