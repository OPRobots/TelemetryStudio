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
  x: number;
  y: number;
  width: number;
  height: number;
  dataFields: string[];
  config: Record<string, unknown>;
  visible: boolean;
  zIndex: number;
}

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
