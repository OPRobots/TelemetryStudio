import { describe, it, expect } from 'vitest';
import {
  decodeSession,
  encodeSession,
  sessionToDataset,
  datasetToSessionTelemetry,
  datasetToSession,
  decodeFieldSchema,
  encodeFieldSchema,
} from '@core/session-codec';
import type { SessionFile } from '@core/types/session';

const SAMPLE_SESSION: SessionFile = {
  v: 1,
  name: 'Round Trip Test',
  created: '2026-01-15T10:30:00Z',
  video: {
    file: 'test.mp4',
    fps: 30,
    duration_s: 10,
    resolution: [1920, 1080],
  },
  sync: {
    offset_ms: 100,
    anchor: [2.5, 2500],
    rate: 1.0,
  },
  telemetry: {
    schema: [
      ['speed', 'number', 'RPM', 0, 10000],
      ['motor_left', 'number', 'PWM', -1000, 1000],
      ['gyro', 'number', '°/s'],
    ],
    frames: [
      [0, 1000, 500, 10],
      [10, 1100, 520, 15],
      [20, 1200, 540, 12],
    ],
  },
  layout: {
    widgets: [
      {
        t: 'TimeSeriesChart',
        size: [10, 6],
        fields: ['speed', 'motor_left'],
        config: { colors: ['#22d3ee', '#4ade80'] },
      },
    ],
  },
};

describe('session-codec round-trip', () => {
  it('should encode and decode without data loss', () => {
    const json = encodeSession(SAMPLE_SESSION);
    const decoded = decodeSession(json);

    expect(decoded.v).toBe(1);
    expect(decoded.name).toBe('Round Trip Test');
    expect(decoded.video.file).toBe('test.mp4');
    expect(decoded.video.resolution).toEqual([1920, 1080]);
    expect(decoded.sync.offset_ms).toBe(100);
    expect(decoded.sync.anchor).toEqual([2.5, 2500]);
    expect(decoded.telemetry.frames).toHaveLength(3);
    expect(decoded.telemetry.frames[0]).toEqual([0, 1000, 500, 10]);
    expect(decoded.layout.widgets[0]?.t).toBe('TimeSeriesChart');
  });

  it('should convert session to dataset', () => {
    const dataset = sessionToDataset(SAMPLE_SESSION);

    expect(dataset.name).toBe('Round Trip Test');
    expect(dataset.frameCount).toBe(3);
    expect(dataset.frames[0]?.timestamp_ms).toBe(0);
    expect(dataset.frames[2]?.timestamp_ms).toBe(20);
    expect(dataset.frames[0]?.data.speed).toBe(1000);
    expect(dataset.frames[2]?.data.gyro).toBe(12);
    expect(dataset.schema).toHaveLength(3);
    expect(dataset.schema[0]?.name).toBe('speed');
    expect(dataset.schema[0]?.unit).toBe('RPM');
    expect(dataset.schema[0]?.min).toBe(0);
    expect(dataset.schema[0]?.max).toBe(10000);
  });

  it('should convert dataset frames back to compact session telemetry', () => {
    const dataset = sessionToDataset(SAMPLE_SESSION);
    const telemetry = datasetToSessionTelemetry(dataset);

    expect(telemetry.frames).toHaveLength(3);
    expect(telemetry.frames[0]).toEqual([0, 1000, 500, 10]);
    expect(telemetry.schema[0]).toEqual(['speed', 'number', 'RPM', 0, 10000]);
  });

  it('should build a full session from a dataset', () => {
    const dataset = sessionToDataset(SAMPLE_SESSION);
    const rebuilt = datasetToSession(
      dataset,
      { file: 'out.mp4', fps: 30, duration_s: 5, resolution: [1280, 720] },
      { offset_ms: 0, anchor: null, rate: 1 },
      [{ t: 'TimeSeriesChart', size: [4, 2], fields: ['speed'] }]
    );

    expect(rebuilt.v).toBe(1);
    expect(rebuilt.video.file).toBe('out.mp4');
    expect(rebuilt.telemetry.frames).toHaveLength(3);
    expect(rebuilt.layout.widgets).toHaveLength(1);
  });

  it('should round-trip field schemas', () => {
    const schema = [
      { name: 'a', type: 'number' as const },
      { name: 'b', type: 'bitmask' as const, bitmaskWidth: 16 },
      { name: 'c', type: 'boolean' as const },
    ];
    const encoded = encodeFieldSchema(schema);
    const decoded = decodeFieldSchema(encoded);

    expect(decoded[1]?.bitmaskWidth).toBe(16);
    expect(decoded[2]?.type).toBe('boolean');
  });

  it('should reject invalid JSON', () => {
    expect(() => decodeSession('not json')).toThrow();
  });

  it('should reject wrong version', () => {
    expect(() => decodeSession(JSON.stringify({ v: 99 }))).toThrow('Unsupported session version');
  });
});
