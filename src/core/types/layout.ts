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
  global: GlobalConfig;
}

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
