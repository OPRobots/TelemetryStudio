import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserRegistry } from '@parsers/parser-registry';
import { SerialUARTParser } from '@parsers/serial-uart-parser';
import { JSONSessionParser } from '@parsers/json-session-parser';

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  afterEach(() => {
    registry.destroyAll();
  });

  it('should register and retrieve parsers', () => {
    const parser = new SerialUARTParser();
    registry.register(parser);

    expect(registry.get('Serial UART')).toBe(parser);
  });

  it('should return all parsers sorted by priority', () => {
    registry.register(new SerialUARTParser());
    registry.register(new JSONSessionParser());

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].metadata.priority).toBeLessThanOrEqual(all[1].metadata.priority);
  });

  it('should detect parser for JSON files', () => {
    registry.register(new JSONSessionParser());

    const json = JSON.stringify({ v: 1, telemetry: { frames: [] } });
    const buffer = new TextEncoder().encode(json).buffer as ArrayBuffer;
    const detected = registry.detectParser(buffer, 'session.json');

    expect(detected).not.toBeNull();
    expect(detected!.metadata.name).toBe('JSON Session');
  });

  it('should return null if no parser matches', () => {
    registry.register(new JSONSessionParser());

    const buffer = new TextEncoder().encode('random').buffer as ArrayBuffer;
    const detected = registry.detectParser(buffer, 'data.txt');

    expect(detected).toBeNull();
  });

  it('should get streaming parsers only', () => {
    registry.register(new SerialUARTParser());
    registry.register(new JSONSessionParser());

    const streaming = registry.getStreamingParsers();
    expect(streaming).toHaveLength(1);
    expect(streaming[0].metadata.name).toBe('Serial UART');
  });

  it('should unregister parsers', () => {
    registry.register(new SerialUARTParser());
    expect(registry.get('Serial UART')).toBeDefined();

    registry.unregister('Serial UART');
    expect(registry.get('Serial UART')).toBeUndefined();
  });

  it('should overwrite duplicate registrations', () => {
    registry.register(new SerialUARTParser());
    registry.register(new SerialUARTParser());

    expect(registry.getAll()).toHaveLength(1);
  });

  it('should clean up all parsers on destroyAll', () => {
    registry.register(new SerialUARTParser());
    registry.register(new JSONSessionParser());
    registry.destroyAll();

    expect(registry.getAll()).toHaveLength(0);
  });
});
