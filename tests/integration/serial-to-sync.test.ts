import { describe, it, expect, beforeEach } from 'vitest';
import { CsvParser, DEFAULT_CSV_FIELDS, type SerialParserBase } from '@parsers/serial';
import { telemetryStore } from '@core/telemetry-store';
import { VideoSynchronizer } from '@core/video-synchronizer';
import { buildAutoLayoutWidgets } from '@renderer/lib/auto-layout';
import {
  sessionToDataset,
  datasetToSession,
  encodeSession,
  decodeSession,
} from '@core/session-codec';

/**
 * Simula una captura completa: el robot envía líneas CSV a ~50 Hz durante 2 s.
 * Verifica el camino Serial → parser → TelemetryStore → dataset → auto-layout → sync.
 */
function simulateStm32Capture(hz = 50, seconds = 2): string[] {
  const lines: string[] = [];
  const interval = 1000 / hz;
  const total = Math.round(hz * seconds);
  for (let i = 0; i < total; i++) {
    const t = Math.round(i * interval);
    const s = t / 1000;
    lines.push(
      `${t},${(Math.sin(s) * 9.8).toFixed(2)},${(Math.cos(s) * 9.8).toFixed(2)},9.80,` +
        `${(Math.sin(s) * 180).toFixed(2)},0.00,0.00,${(100 - i * 0.01).toFixed(2)}`
    );
  }
  return lines;
}

describe('Integración: Serial → Store → auto-layout → sync', () => {
  let parser: SerialParserBase;

  beforeEach(() => {
    telemetryStore.clear();
    parser = new CsvParser(true, ',', DEFAULT_CSV_FIELDS);
  });

  it('ingesta una captura CSV completa en el TelemetryStore', () => {
    const lines = simulateStm32Capture();
    for (const line of lines) {
      const frame = parser.parseLine(line);
      if (frame) telemetryStore.addFrame(frame);
    }

    expect(telemetryStore.frameCount).toBe(lines.length);
    expect(parser.getDiscoveredSchema().map((s) => s.name)).toEqual([
      'accX',
      'accY',
      'accZ',
      'gyroX',
      'gyroY',
      'gyroZ',
      'battery',
    ]);
  });

  it('auto-configura una gráfica por campo numérico a media anchura', () => {
    for (const line of simulateStm32Capture()) {
      const frame = parser.parseLine(line);
      if (frame) telemetryStore.addFrame(frame);
    }

    const widgets = buildAutoLayoutWidgets(parser.getDiscoveredSchema());
    const charts = widgets.filter((w) => w.type === 'TimeSeriesChart');
    expect(charts).toHaveLength(7);
    expect(charts.every((c) => c.dataFields.length === 1 && c.width === 6)).toBe(true);
  });

  it('selecciona el frame correcto según el tiempo de vídeo', () => {
    for (const line of simulateStm32Capture()) {
      const frame = parser.parseLine(line);
      if (frame) telemetryStore.addFrame(frame);
    }

    const sync = new VideoSynchronizer();

    // Sin desfase: vídeo 1.0s → telemetría 1000ms
    const f1 = telemetryStore.findClosestFrame(sync.mapTime(1000));
    expect(f1?.timestamp_ms).toBe(1000);

    // Offset +500 ms: vídeo 0.5s corresponde a telemetría 1000 ms
    sync.setDriftOffset(500);
    const f2 = telemetryStore.findClosestFrame(sync.mapTime(500));
    expect(f2?.timestamp_ms).toBe(1000);

    // Anchor: vídeo 0s se ancla a telemetría 1500 ms
    sync.setDriftOffset(0);
    sync.setAnchorPoint(0, 1500);
    const f3 = telemetryStore.findClosestFrame(sync.mapTime(0));
    expect(f3?.timestamp_ms).toBe(1500);
  });

  it('mantiene los datos tras exportar e importar una sesión', () => {
    for (const line of simulateStm32Capture()) {
      const frame = parser.parseLine(line);
      if (frame) telemetryStore.addFrame(frame);
    }

    const dataset = parser.buildDataset('Captura test');
    const session = datasetToSession(
      dataset,
      { file: 'video.mp4', fps: 30, duration_s: 2, resolution: [1920, 1080] },
      { offset_ms: 250, anchor: [0, 0], rate: 1 },
      [{ t: 'TimeSeriesChart', size: [12, 6], fields: ['accX', 'accY'] }]
    );

    const reloaded = sessionToDataset(decodeSession(encodeSession(session)));
    expect(reloaded.frameCount).toBe(dataset.frameCount);
    expect(reloaded.frames[0]?.data.accX).toBeCloseTo(dataset.frames[0]!.data.accX as number);
    expect(reloaded.frames.at(-1)?.timestamp_ms).toBe(
      dataset.frames.at(-1)?.timestamp_ms
    );
    expect(reloaded.schema.map((s) => s.name)).toEqual(dataset.schema.map((s) => s.name));
  });
});
