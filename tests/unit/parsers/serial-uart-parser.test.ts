import { describe, it, expect, beforeEach } from 'vitest';
import { SerialUARTParser } from '@parsers/serial-uart-parser';

describe('SerialUARTParser', () => {
  let parser: SerialUARTParser;

  beforeEach(() => {
    parser = new SerialUARTParser();
  });

  it('should parse a valid line', () => {
    const frame = parser.parseLine('T:1234,S:1500,M:512,-510,G:15');
    expect(frame).not.toBeNull();
    expect(frame!.timestamp_ms).toBe(1234);
    expect(frame!.data.speed_rpm).toBe(1500);
    expect(frame!.data.motor_left).toBe(512);
    expect(frame!.data.motor_right).toBe(-510);
    expect(frame!.data.gyro_z).toBe(15);
  });

  it('should return null for invalid lines', () => {
    expect(parser.parseLine('')).toBeNull();
    expect(parser.parseLine('random text')).toBeNull();
    expect(parser.parseLine('T:abc,S:100')).toBeNull();
    expect(parser.parseLine('G:5')).toBeNull();
  });

  it('should handle negative values', () => {
    const frame = parser.parseLine('T:0,S:-2000,M:-1000,1000,G:-180');
    expect(frame).not.toBeNull();
    expect(frame!.data.speed_rpm).toBe(-2000);
    expect(frame!.data.motor_left).toBe(-1000);
    expect(frame!.data.motor_right).toBe(1000);
    expect(frame!.data.gyro_z).toBe(-180);
  });

  it('should handle zero values', () => {
    const frame = parser.parseLine('T:0,S:0,M:0,0,G:0');
    expect(frame).not.toBeNull();
    expect(frame!.data.speed_rpm).toBe(0);
    expect(frame!.data.motor_left).toBe(0);
    expect(frame!.data.motor_right).toBe(0);
    expect(frame!.data.gyro_z).toBe(0);
  });

  it('should track frame count', () => {
    expect(parser.frameCount).toBe(0);
    parser.parseLine('T:0,S:0,M:0,0,G:0');
    expect(parser.frameCount).toBe(1);
    parser.parseLine('T:10,S:100,M:10,-10,G:5');
    expect(parser.frameCount).toBe(2);
  });

  it('should build a dataset from parsed frames', () => {
    parser.parseLine('T:0,S:1200,M:512,-510,G:15');
    parser.parseLine('T:10,S:1250,M:530,-525,G:18');
    parser.parseLine('T:20,S:1300,M:545,-540,G:12');

    const dataset = parser.buildDataset('Test Serial');
    expect(dataset.name).toBe('Test Serial');
    expect(dataset.frameCount).toBe(3);
    expect(dataset.frames).toHaveLength(3);
    expect(dataset.frames[0].timestamp_ms).toBe(0);
    expect(dataset.frames[2].timestamp_ms).toBe(20);
    expect(dataset.schema).toHaveLength(4);
  });

  it('should sort frames by timestamp in dataset', () => {
    parser.parseLine('T:20,S:100,M:10,-10,G:0');
    parser.parseLine('T:0,S:200,M:20,-20,G:0');
    parser.parseLine('T:10,S:300,M:30,-30,G:0');

    const dataset = parser.buildDataset('Unordered');
    expect(dataset.frames[0].timestamp_ms).toBe(0);
    expect(dataset.frames[1].timestamp_ms).toBe(10);
    expect(dataset.frames[2].timestamp_ms).toBe(20);
  });

  it('should return discovered schema', () => {
    const schema = parser.getDiscoveredSchema();
    expect(schema).toHaveLength(4);
    expect(schema[0].name).toBe('speed_rpm');
    expect(schema[1].name).toBe('motor_left');
    expect(schema[2].name).toBe('motor_right');
    expect(schema[3].name).toBe('gyro_z');
  });

  it('should not support file parsing', () => {
    expect(parser.canParse(new ArrayBuffer(0), 'test.txt')).toBe(false);
  });

  it('should throw on parse()', async () => {
    await expect(parser.parse(new ArrayBuffer(0), 'test.txt')).rejects.toThrow();
  });

  it('should mark stream as complete', () => {
    expect(parser.isStreamComplete()).toBe(false);
    parser.completeStream();
    expect(parser.isStreamComplete()).toBe(true);
  });

  it('should clean up on destroy', () => {
    parser.parseLine('T:0,S:0,M:0,0,G:0');
    parser.destroy();
    expect(parser.frameCount).toBe(0);
  });
});
