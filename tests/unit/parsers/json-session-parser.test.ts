import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSONSessionParser } from '@parsers/json-session-parser';

const FIXTURE_PATH = join(__dirname, '../../fixtures/session.json');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

describe('JSONSessionParser', () => {
  const parser = new JSONSessionParser();

  it('should detect valid session JSON', () => {
    const buffer = new TextEncoder().encode(JSON.stringify({
      v: 1,
      telemetry: { frames: [] },
    })).buffer as ArrayBuffer;
    expect(parser.canParse(buffer, 'session.json')).toBe(true);
  });

  it('should reject non-JSON files', () => {
    const buffer = new TextEncoder().encode('not json').buffer as ArrayBuffer;
    expect(parser.canParse(buffer, 'data.txt')).toBe(false);
  });

  it('should reject non-session JSON', () => {
    const buffer = new TextEncoder().encode(JSON.stringify({ foo: 'bar' })).buffer as ArrayBuffer;
    expect(parser.canParse(buffer, 'config.json')).toBe(false);
  });

  it('should reject non-.json extensions', () => {
    const buffer = new TextEncoder().encode(JSON.stringify({
      v: 1,
      telemetry: { frames: [] },
    })).buffer as ArrayBuffer;
    expect(parser.canParse(buffer, 'data.xml')).toBe(false);
  });

  it('should parse fixture session and produce correct dataset', async () => {
    const dataset = await parser.parse(FIXTURE_BUFFER as unknown as ArrayBuffer, 'session.json');

    expect(dataset.name).toBe('Test Session');
    expect(dataset.frameCount).toBe(5);
    expect(dataset.schema).toHaveLength(4);
    expect(dataset.startTime_ms).toBe(0);
    expect(dataset.endTime_ms).toBe(40);
    expect(dataset.duration_ms).toBe(40);
  });

  it('should parse frame data correctly', async () => {
    const dataset = await parser.parse(FIXTURE_BUFFER as unknown as ArrayBuffer, 'session.json');

    const firstFrame = dataset.frames[0];
    expect(firstFrame.timestamp_ms).toBe(0);
    expect(firstFrame.data.speed_rpm).toBe(1200);
    expect(firstFrame.data.motor_left).toBe(512);
    expect(firstFrame.data.motor_right).toBe(-510);
    expect(firstFrame.data.gyro_z).toBe(15);

    const lastFrame = dataset.frames[4];
    expect(lastFrame.timestamp_ms).toBe(40);
    expect(lastFrame.data.speed_rpm).toBe(1400);
  });

  it('should parse string state fields', async () => {
    const json = JSON.stringify({
      v: 1,
      name: 'States',
      telemetry: {
        schema: [
          ['state', 'string'],
          ['speed', 'number'],
        ],
        frames: [
          [0, 'RUNNING', 100],
          [10, 'IDLE', 200],
        ],
      },
      layout: { widgets: [] },
    });
    const buffer = new TextEncoder().encode(json).buffer as ArrayBuffer;
    const dataset = await parser.parse(buffer, 'states.json');

    expect(dataset.schema[0]?.type).toBe('string');
    expect(dataset.schema[0]?.recommendedWidget).toBe('timeline');
    expect(dataset.frames[0]?.data.state).toBe('RUNNING');
    expect(dataset.frames[1]?.data.state).toBe('IDLE');
  });

  it('should handle missing fields gracefully', async () => {
    const json = JSON.stringify({
      v: 1,
      name: 'Minimal',
      telemetry: {
        schema: [['speed', 'number']],
        frames: [[0, 100], [10, 200]],
      },
    });
    const buffer = new TextEncoder().encode(json).buffer as ArrayBuffer;
    const dataset = await parser.parse(buffer, 'minimal.json');

    expect(dataset.frameCount).toBe(2);
    expect(dataset.frames[0].data.speed).toBe(100);
    expect(dataset.frames[0].data.missing_field).toBeUndefined();
  });

  it('should handle empty frames array', async () => {
    const json = JSON.stringify({
      v: 1,
      name: 'Empty',
      telemetry: {
        schema: [['speed', 'number']],
        frames: [],
      },
    });
    const buffer = new TextEncoder().encode(json).buffer as ArrayBuffer;
    const dataset = await parser.parse(buffer, 'empty.json');

    expect(dataset.frameCount).toBe(0);
    expect(dataset.duration_ms).toBe(0);
  });

  it('should reject unsupported versions', async () => {
    const json = JSON.stringify({
      v: 99,
      telemetry: { schema: [], frames: [] },
    });
    const buffer = new TextEncoder().encode(json).buffer as ArrayBuffer;

    await expect(parser.parse(buffer, 'old.json')).rejects.toThrow('Unsupported session version');
  });

  it('should call onProgress callback', async () => {
    const progressCalls: number[] = [];
    await parser.parse(FIXTURE_BUFFER as unknown as ArrayBuffer, 'session.json', (p) => {
      progressCalls.push(p);
    });
    expect(progressCalls).toContain(0);
    expect(progressCalls).toContain(50);
    expect(progressCalls).toContain(100);
  });
});
