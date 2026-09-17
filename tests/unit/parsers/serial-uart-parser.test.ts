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
    parser.parseLine('T:0,S:1200,M:512,-510,G:15');
    const schema = parser.getDiscoveredSchema();
    expect(schema).toHaveLength(4);
    expect(schema[0].name).toBe('speed_rpm');
    expect(schema[1].name).toBe('motor_left');
    expect(schema[2].name).toBe('motor_right');
    expect(schema[3].name).toBe('gyro_z');
  });

  it('should parse generic key:value format and discover fields', () => {
    const frame = parser.parseLine('T:100,speed_rpm:1500,battery:85.5,armed:true');
    expect(frame).not.toBeNull();
    expect(frame!.timestamp_ms).toBe(100);
    expect(frame!.data.speed_rpm).toBe(1500);
    expect(frame!.data.battery).toBe(85.5);
    expect(frame!.data.armed).toBe(true);

    const schema = parser.getDiscoveredSchema();
    expect(schema.map((s) => s.name)).toEqual(['speed_rpm', 'battery', 'armed']);
    expect(schema[1].type).toBe('number');
    expect(schema[2].type).toBe('boolean');
  });

  it('should infer bitmask values from hex notation', () => {
    const frame = parser.parseLine('T:0,ir_sensors:0xAAAA');
    expect(frame).not.toBeNull();
    expect(frame!.data.ir_sensors).toBe(0xaaaa);

    const schema = parser.getDiscoveredSchema();
    const ir = schema.find((s) => s.name === 'ir_sensors');
    expect(ir?.type).toBe('bitmask');
    expect(ir?.bitmaskWidth).toBe(16);
    expect(ir?.recommendedWidget).toBe('bitmask');
  });

  it('tracks the widest hex value seen for a bitmask', () => {
    parser.parseLine('T:0,ir_sensors:0xFF');
    parser.parseLine('T:10,ir_sensors:0x001FFE');
    const ir = parser.getDiscoveredSchema().find((s) => s.name === 'ir_sensors');
    expect(ir?.type).toBe('bitmask');
    expect(ir?.bitmaskWidth).toBe(24);
  });

  it('upgrades a field from number to bitmask when hex appears', () => {
    parser.parseLine('T:0,ir_sensors:255');
    expect(parser.getDiscoveredSchema()[0]?.type).toBe('number');
    parser.parseLine('T:10,ir_sensors:0xFF');
    const ir = parser.getDiscoveredSchema()[0];
    expect(ir?.type).toBe('bitmask');
    expect(ir?.bitmaskWidth).toBe(8);
  });

  it('infers bitmask from hex in CSV columns', () => {
    parser.setCsvFields(['ir_sensors', 'speed']);
    parser.parseLine('0,0x0F,100');
    const schema = parser.getDiscoveredSchema();
    expect(schema.find((s) => s.name === 'ir_sensors')?.type).toBe('bitmask');
    expect(schema.find((s) => s.name === 'speed')?.type).toBe('number');
  });

  it('interprets non-numeric keyed values as string labels', () => {
    const frame = parser.parseLine('T:0,state:RUNNING,speed:100');
    expect(frame).not.toBeNull();
    expect(frame!.data.state).toBe('RUNNING');
    expect(frame!.data.speed).toBe(100);

    const state = parser.getDiscoveredSchema().find((s) => s.name === 'state');
    expect(state?.type).toBe('string');
    expect(state?.recommendedWidget).toBe('timeline');
  });

  it('keeps booleans, numbers and hex out of the string path', () => {
    const frame = parser.parseLine('T:0,a:true,b:3.5,c:0x0F');
    expect(frame!.data.a).toBe(true);
    expect(frame!.data.b).toBe(3.5);

    const schema = parser.getDiscoveredSchema();
    expect(schema.find((s) => s.name === 'a')?.type).toBe('boolean');
    expect(schema.find((s) => s.name === 'b')?.type).toBe('number');
    expect(schema.find((s) => s.name === 'c')?.type).toBe('bitmask');
  });

  it('parses string columns in CSV but rejects a string timestamp', () => {
    expect(parser.parseLine('RUNNING,1,2')).toBeNull();

    parser.setCsvFields(['state', 'speed']);
    const frame = parser.parseLine('0,RUNNING,100');
    expect(frame).not.toBeNull();
    expect(frame!.data.state).toBe('RUNNING');
    expect(frame!.data.speed).toBe(100);
    expect(parser.getDiscoveredSchema().find((s) => s.name === 'state')?.type).toBe('string');
  });

  it('should ignore malformed tokens but keep valid ones', () => {
    const frame = parser.parseLine('T:0,speed:100,garbage=,battery:50');
    expect(frame).not.toBeNull();
    expect(frame!.data.speed).toBe(100);
    expect(frame!.data.battery).toBe(50);
  });

  it('should parse the STM32 bare CSV format using default fields', () => {
    const frame = parser.parseLine('1000,1.20,2.30,9.80,10.0,-5.0,0.0,99.5');
    expect(frame).not.toBeNull();
    expect(frame!.timestamp_ms).toBe(1000);
    expect(frame!.data.accX).toBeCloseTo(1.2);
    expect(frame!.data.accY).toBeCloseTo(2.3);
    expect(frame!.data.accZ).toBeCloseTo(9.8);
    expect(frame!.data.battery).toBeCloseTo(99.5);

    const schema = parser.getDiscoveredSchema();
    expect(schema.map((s) => s.name)).toEqual([
      'accX',
      'accY',
      'accZ',
      'gyroX',
      'gyroY',
      'gyroZ',
      'battery',
    ]);
  });

  it('should allow custom CSV field names', () => {
    parser.setCsvFields(['speed', 'angle']);
    const frame = parser.parseLine('50,1234,90');
    expect(frame).not.toBeNull();
    expect(frame!.timestamp_ms).toBe(50);
    expect(frame!.data.speed).toBe(1234);
    expect(frame!.data.angle).toBe(90);
  });

  it('should reject bare CSV without a valid timestamp', () => {
    expect(parser.parseLine('abc,1,2')).toBeNull();
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
