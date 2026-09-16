/**
 * Layout completo del dashboard guardado en JSON.
 */
export interface DashboardLayout {
  version: 1;
  name: string;
  description?: string;
  createdAt: string;
  modifiedAt: string;
  videoPanel: VideoPanelConfig;
  widgets: WidgetConfig[];
  panels: LayoutPanels;
  global: GlobalConfig;
}

/**
 * Tamaños y visibilidad de los paneles de la interfaz.
 * Se guardan con el layout para restaurar la distribución del usuario.
 */
export interface LayoutPanels {
  /** Ancho del inspector en píxeles (200–480). */
  inspectorWidth: number;
  /** Si el inspector está visible. */
  inspectorVisible: boolean;
  /** Proporción de alto del panel de vídeo respecto a la columna (0.15–0.8). */
  videoRatio: number;
  /** Proporción de alto del panel A en comparación (0.3–0.7). */
  comparisonRatio: number;
}

/** Valores por defecto de los paneles. */
export const DEFAULT_PANELS: LayoutPanels = {
  inspectorWidth: 288,
  inspectorVisible: true,
  videoRatio: 0.42,
  comparisonRatio: 0.5,
};

export interface VideoPanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  showOverlays: boolean;
  overlays: OverlayConfig[];
}

export interface WidgetConfig {
  id: string;
  type: string;
  label: string;
  /** Ancho en columnas de la rejilla (3..12). */
  width: number;
  /** Alto en filas de la rejilla (2..16). */
  height: number;
  dataFields: string[];
  config: Record<string, unknown>;
  visible: boolean;
}

/** Número de columnas de la rejilla de widgets. */
export const WIDGET_COLUMNS = 12;

/** Anchos permitidos (columnas): completo, 3/4, 2/3, 1/2, 1/3, 1/4. */
export const WIDTH_PRESETS = [12, 9, 8, 6, 4, 3] as const;

/** Ancho mínimo global (1/4). */
export const MIN_WIDTH = 3;

/** Alto de fila en píxeles (unidad de los "saltos" de alto). */
export const ROW_UNIT = 40;

/** Alto mínimo y máximo globales (en filas). */
export const MIN_ROWS = 2;
export const MAX_ROWS = 16;

export interface OverlayConfig {
  type: 'speed' | 'state' | 'vector' | 'custom';
  position: { x: number; y: number };
  dataField: string;
  style: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
  };
}

export interface GlobalConfig {
  theme: 'dark' | 'light';
  units: {
    speed: 'm/s' | 'cm/s' | 'rpm';
    distance: 'm' | 'cm' | 'mm';
    angle: 'deg' | 'rad';
  };
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}
