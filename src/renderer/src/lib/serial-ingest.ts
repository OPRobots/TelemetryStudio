import {
  createSerialParser,
  type SerialParserBase,
  type SerialParserConfig,
} from '@parsers/serial';
import { telemetryStore } from '@core/telemetry-store';
import { eventBus } from '@core/event-bus';
import { useAppStore } from '../stores/app-store';
import { useLayoutStore } from '../stores/layout-store';
import { useCursorStore } from '../stores/cursor-store';
import { buildAutoLayoutWidgets } from './auto-layout';
import { STALE_TRANSMISSION_MS } from './session-save-status';

const DEFAULT_CONFIG: SerialParserConfig = { kind: 'keyvalue', hasTimestamp: true };

/**
 * Gestiona la ingesta de telemetría Serial en el renderer:
 * - Mantiene una instancia del parser elegido (Default/CSV/Macroarray)
 * - Añade frames al TelemetryStore en tiempo real
 * - Descubre el schema y auto-configura el layout inicial
 * - Construye el dataset al cerrar el stream
 */
class SerialIngestService {
  private parser: SerialParserBase = createSerialParser(DEFAULT_CONFIG);
  private config: SerialParserConfig = DEFAULT_CONFIG;
  private port = '';
  private baudRate = 115200;
  private unsubData: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;
  private listening = false;
  private autoLayoutApplied = false;
  private sawValidLine = false;

  private ensureListening(): void {
    if (this.listening || typeof window === 'undefined' || !window.api) return;
    this.listening = true;

    this.unsubData = window.api.serialOnData((line) => this.onLine(line));
    this.unsubStatus = window.api.serialOnStatus((status) => this.onStatus(status));
  }

  async listPorts(): Promise<Array<{ path: string; manufacturer?: string; vendorId?: string }>> {
    if (!window.api) return [];
    return window.api.serialList();
  }

  async connect(
    path: string,
    baudRate: number,
    config: SerialParserConfig = DEFAULT_CONFIG
  ): Promise<{ success: boolean; error?: string }> {
    if (!window.api) return { success: false, error: 'API no disponible' };
    this.ensureListening();
    this.config = config;
    this.port = path;
    this.baudRate = baudRate;
    this.reset();

    const result = await window.api.serialOpen(path, baudRate);
    if (result.success) {
      useAppStore.getState().setSerialConnected(true, path);
      useAppStore.getState().setBaudRate(baudRate);
      useAppStore.getState().setStreamState('streaming');
      useAppStore.getState().setStatusMessage('');
      useAppStore.getState().setTelemetryTimeReliable(config.hasTimestamp);
    } else {
      useAppStore.getState().setSerialError(result.error ?? 'Error desconocido');
      useAppStore.getState().setStreamState('idle');
    }
    return result;
  }

  async disconnect(): Promise<void> {
    if (!window.api) return;
    await window.api.serialClose();
    this.completeStream();
  }

  private reset(): void {
    this.parser.destroy();
    this.parser = createSerialParser(this.config);
    this.sawValidLine = false;
    telemetryStore.clearPrimary();
    this.autoLayoutApplied = false;
    useAppStore.getState().setDataset(null, []);
    useAppStore.getState().setFrameCount(0);
    useAppStore.getState().setLastDataAt(null);
    useAppStore.getState().setSerialError(null);
  }

  private restartCapture(): void {
    telemetryStore.clearPrimary();
    this.parser.resetFrames();
    this.sawValidLine = false;
    useCursorStore.getState().clear();
    useCursorStore.getState().clearZoom();
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    const store = useAppStore.getState();
    const now = Date.now();
    const prevDataAt = store.lastDataAt;

    const frame = this.parser.parseLine(trimmed);

    if (frame === null) {
      // Validación estricta (CSV): la primera línea debe parsear; si no, se
      // rechaza la importación.
      if (!this.sawValidLine && this.parser.strict) {
        void this.disconnect().then(() => {
          const s = useAppStore.getState();
          s.setSerialError(
            'El formato no coincide con el CSV configurado. Revisa el separador y las etiquetas.'
          );
          s.setStatusMessage('Captura rechazada: formato CSV no válido');
        });
      }
      return;
    }

    // Nueva transmisión: por silencio ≥ umbral, o por timestamp que vuelve a 0.
    const gap = prevDataAt != null && now - prevDataAt >= STALE_TRANSMISSION_MS;
    const restart = gap || (this.sawValidLine && frame.timestamp_ms === 0);
    if (restart) {
      this.restartCapture();
      this.parser.parseLine(trimmed); // deja este frame en el parser ya limpio
    }

    this.sawValidLine = true;
    telemetryStore.addFrame(frame);
    eventBus.emit('data:streaming-frame', { frame });
    store.setLastDataAt(now);

    const count = this.parser.frameCount;
    if (restart || count % 5 === 0) {
      useAppStore.getState().setSchema(this.parser.getDiscoveredSchema());
      useAppStore.getState().setFrameCount(count);
      this.maybeAutoLayout();
    }
  }

  private onStatus(status: { connected: boolean; error?: string }): void {
    const store = useAppStore.getState();
    if (status.connected) {
      store.setSerialConnected(true);
      store.setStreamState('streaming');
      return;
    }

    if (status.error) {
      store.setSerialError(status.error);
      store.setStatusMessage(`Error de serial: ${status.error}`);
    }

    if (store.streamState === 'streaming') {
      this.completeStream();
    }
    store.setSerialConnected(false);
  }

  private completeStream(): void {
    this.parser.completeStream();
    const frames = this.parser.frameCount;
    const schema = this.parser.getDiscoveredSchema();

    if (frames > 0) {
      const dataset = this.parser.buildDataset('Captura Serial', {
        port: this.port,
        baudRate: this.baudRate,
      });
      useAppStore.getState().setDataset(dataset, schema);
      useAppStore.getState().setStatusMessage('');
    }

    useAppStore.getState().setStreamState('stopped');
    this.maybeAutoLayout();
  }

  private maybeAutoLayout(): void {
    if (this.autoLayoutApplied) return;
    const schema = useAppStore.getState().schema;
    if (schema.length === 0) return;

    const layoutState = useLayoutStore.getState();
    if (layoutState.widgets.length > 0) {
      this.autoLayoutApplied = true;
      return;
    }

    const widgets = buildAutoLayoutWidgets(schema);
    if (widgets.length > 0) {
      layoutState.replaceWidgets(widgets);
      this.autoLayoutApplied = true;
    }
  }
}

export const serialIngest = new SerialIngestService();
