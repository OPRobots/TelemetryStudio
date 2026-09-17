import type { ComponentType } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
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
  /**
   * Devuelve el dataset completo del panel (primario o comparación) en el
   * momento de dibujar. Es una función (no el array) para que el widget lea
   * siempre los frames actuales sin que el host re-renderice por frame.
   */
  getFrames: () => TelemetryFrame[];

  /**
   * Timestamp bajo el cursor (hover) del usuario, o `null`. El widget resuelve
   * el timestamp efectivo con `resolveViewTimestamp` (hover > vídeo > frame),
   * leyendo los frames del vídeo/streaming desde el `FrameBus` del panel.
   */
  hoverTimestamp_ms?: number | null;

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
