import { SerialUARTParser } from '@parsers/serial-uart-parser';
import { telemetryStore } from '@core/telemetry-store';
import { eventBus } from '@core/event-bus';
import { useAppStore } from '../stores/app-store';
import { useLayoutStore } from '../stores/layout-store';
import { useCursorStore } from '../stores/cursor-store';
import { buildAutoLayoutWidgets } from './auto-layout';
import { STALE_TRANSMISSION_MS } from './session-save-status';

/**
 * Gestiona la ingesta de telemetría Serial en el renderer:
 * - Mantiene una instancia del parser
 * - Añade frames al TelemetryStore en tiempo real
 * - Descubre el schema y auto-configura el layout inicial
 * - Construye el dataset al cerrar el stream
 */
class SerialIngestService {
  private parser = new SerialUARTParser();
  private unsubData: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;
  private listening = false;
  private autoLayoutApplied = false;

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
    csvFields?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    if (!window.api) return { success: false, error: 'API no disponible' };
    this.ensureListening();
    this.reset();
    if (csvFields && csvFields.length > 0) {
      this.parser.setCsvFields(csvFields);
    }

    const result = await window.api.serialOpen(path, baudRate);
    if (result.success) {
      useAppStore.getState().setSerialConnected(true, path);
      useAppStore.getState().setStreamState('streaming');
      useAppStore.getState().setStatusMessage(`Serial conectado en ${path} @ ${baudRate}`);
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
    this.parser = new SerialUARTParser();
    telemetryStore.clearPrimary();
    this.autoLayoutApplied = false;
    useAppStore.getState().setDataset(null, []);
    useAppStore.getState().setFrameCount(0);
    useAppStore.getState().setLastDataAt(null);
    useAppStore.getState().setSerialError(null);
  }

  private onLine(line: string): void {
    const store = useAppStore.getState();
    const now = Date.now();
    const prevDataAt = store.lastDataAt;

    const frame = this.parser.parseLine(line);
    if (!frame) return;

    // Nueva captura: si ya había datos y esta llegada implica una nueva
    // transmisión (tras estar "en reposo" ≥ STALE_TRANSMISSION_MS, o porque el
    // timestamp vuelve a 0), se descarta lo anterior y se vuelve a plotear
    // desde el principio, conservando layout y schema.
    const resumed =
      prevDataAt != null &&
      (now - prevDataAt >= STALE_TRANSMISSION_MS || frame.timestamp_ms === 0);
    if (resumed) {
      telemetryStore.clearPrimary();
      this.parser.resetFrames();
      this.parser.parseLine(line); // deja este frame en el parser ya limpio
      store.setFrameCount(1);
      useCursorStore.getState().clear();
      useCursorStore.getState().clearZoom();
    }

    telemetryStore.addFrame(frame);
    eventBus.emit('data:streaming-frame', { frame });
    store.setLastDataAt(now);

    const count = this.parser.frameCount;
    if (count % 5 === 0) {
      const schema = this.parser.getDiscoveredSchema();
      useAppStore.getState().setSchema(schema);
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
      const dataset = this.parser.buildDataset('Captura Serial');
      useAppStore.getState().setDataset(dataset, schema);
      useAppStore.getState().setStatusMessage(`Stream finalizado: ${frames} frames`);
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
