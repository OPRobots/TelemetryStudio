import type { TelemetryDataset, TelemetryFrame, DataSource } from './telemetry';
import type { VideoFrameContext } from './video';
import type { DashboardLayout, WidgetConfig } from './layout';
import type { SessionFile } from './session';

/**
 * Mapa de todos los eventos del EventBus con sus payloads.
 */
export interface EventMap {
  // === Data ===
  'data:loaded': { dataset: TelemetryDataset };
  'data:frame': { frame: TelemetryFrame; index: number };
  'data:streaming-start': { source: DataSource };
  'data:streaming-stop': {};
  'data:streaming-frame': { frame: TelemetryFrame };

  // === Video ===
  'video:loaded': { duration_s: number; fps: number; width: number; height: number };
  'video:frame': { context: VideoFrameContext };
  'video:play': {};
  'video:pause': {};
  'video:seek': { time_s: number };
  'video:rate-change': { rate: number };

  // === Sync ===
  'sync:frame': { frame: TelemetryFrame; context: VideoFrameContext };
  'comparison:frame': { frame: TelemetryFrame; context: VideoFrameContext };
  'sync:anchor-set': { videoFrame: number; telemetryFrame: number };
  'sync:offset-change': { offset_ms: number };
  'sync:rate-change': { rate: number };

  // === UI ===
  'ui:widget-add': { widgetConfig: WidgetConfig };
  'ui:widget-remove': { widgetId: string };
  'ui:widget-update': { widgetId: string; config: Partial<WidgetConfig> };
  'ui:layout-load': { layout: DashboardLayout };
  'ui:layout-save': { layout: DashboardLayout };

  // === Comparison ===
  'comparison:start': { referenceSession: SessionFile; referenceDataset: TelemetryDataset };
  'comparison:stop': {};
  'comparison:widget-mismatch': { differences: string[] };

  // === Export ===
  'export:start': { config: import('./video').ExportConfig };
  'export:progress': {
    percent: number;
    currentFrame: number;
    totalFrames: number;
    etaMs: number | null;
  };
  'export:complete': { outputPath: string };
  'export:error': { message: string };

  // === System ===
  'system:error': { source: string; message: string; stack?: string };
  'system:log': { level: 'info' | 'warn' | 'error'; message: string };
}
