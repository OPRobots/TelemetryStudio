import { describe, it, expect } from 'vitest';
import {
  decodeSession,
  encodeSession,
  sessionToDataset,
  datasetToSessionTelemetry,
} from '@core/session-codec';
import type { SessionFile } from '@core/types/session';

const SAMPLE_SESSION: SessionFile = {
  v: 1,
  name: 'Round Trip Test',
  created: '2026-01-15T10:30:00Z',
  video: {
    file: 'test.mp4',
    fps: 30,
    duration_ms: 10000,
    width: 1920,
    height: 1080,
  },
  sync: {
    offset_ms: 100,
    anchor: [2.5, 2500],
    rate: 1.0,
  },
  telemetry: {
    fps: 30,
    num_frames: 3,
    duration_ms: 20,
    fields: ['speed', 'motor_left', 'gyro'],
    frames: [
      { t: 0, d: { speed: 1000, motor_left: 500, gyro: 10 } },
      { t: 10, d: { speed: 1100, motor_left: 520, gyro: 15 } },
      { t: 20, d: { speed: 1200, motor_left: 540, gyro: 12 } },
    ],
  },
  layout: {
    widgets: [
      {
        t: 'TimeSeriesChart',
        pos: [0, 0],
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
    expect(decoded.sync.offset_ms).toBe(100);
    expect(decoded.sync.anchor).toEqual([2.5, 2500]);
    expect(decoded.telemetry.frames).toHaveLength(3);
    expect(decoded.telemetry.frames[0].d.speed).toBe(1000);
    expect(decoded.telemetry.frames[2].d.gyro).toBe(12);
    expect(decoded.layout.widgets).toHaveLength(1);
    expect(decoded.layout.widgets[0].t).toBe('TimeSeriesChart');
  });

  it('should convert session to dataset', () => {
    const dataset = sessionToDataset(SAMPLE_SESSION);

    expect(dataset.name).toBe('Round Trip Test');
    expect(dataset.frameCount).toBe(3);
    expect(dataset.frames[0].timestamp_ms).toBe(0);
    expect(dataset.frames[2].timestamp_ms).toBe(20);
    expect(dataset.frames[0].data.speed).toBe(1000);
    expect(dataset.schema).toHaveLength(3);
    expect(dataset.schema[0].name).toBe('speed');
    expect(dataset.schema[1].name).toBe('motor_left');
  });

  it('should convert dataset frames back to session telemetry', () => {
    const dataset = sessionToDataset(SAMPLE_SESSION);
    const telemetry = datasetToSessionTelemetry(dataset);

    expect(telemetry.frames).toHaveLength(3);
    expect(telemetry.frames[0].t).toBe(0);
    expect(telemetry.frames[2].t).toBe(20);
    expect(telemetry.fields).toEqual(['speed', 'motor_left', 'gyro']);
  });

  it('should reject invalid JSON', () => {
    expect(() => decodeSession('not json')).toThrow();
  });

  it('should reject wrong version', () => {
    expect(() => decodeSession(JSON.stringify({ v: 99 }))).toThrow('Unsupported session version');
  });
});
