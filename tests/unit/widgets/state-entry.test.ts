import { describe, it, expect } from 'vitest';
import {
  toStateValue,
  resolveStateEntry,
  defaultStateEntry,
  collectStateKeys,
  sortStateKeys,
  hashHue,
} from '@widgets/state-timeline/state-entry';
import type { TelemetryFrame } from '@core/types/telemetry';

describe('state-entry', () => {
  it('normalizes telemetry values to state values', () => {
    expect(toStateValue(3)).toBe(3);
    expect(toStateValue(true)).toBe(1);
    expect(toStateValue(false)).toBe(0);
    expect(toStateValue('RUNNING')).toBe('RUNNING');
    expect(toStateValue(null)).toBeUndefined();
    expect(toStateValue([1, 2])).toBeUndefined();
  });

  it('uses the string itself as the default label', () => {
    const entry = defaultStateEntry('RUNNING');
    expect(entry.label).toBe('RUNNING');
    expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('uses S<n> for numeric defaults', () => {
    expect(defaultStateEntry(2).label).toBe('S2');
  });

  it('is deterministic for the same text', () => {
    expect(hashHue('RUNNING')).toBe(hashHue('RUNNING'));
    expect(resolveStateEntry('RUNNING', {}).color).toBe(resolveStateEntry('RUNNING', {}).color);
  });

  it('lets the stateMap override label and color (rename)', () => {
    const entry = resolveStateEntry('RUNNING', {
      RUNNING: { label: 'Corriendo', color: '#123456' },
    });
    expect(entry.label).toBe('Corriendo');
    expect(entry.color).toBe('#123456');
  });

  it('falls back per field when the entry is incomplete', () => {
    const entry = resolveStateEntry('RUNNING', { RUNNING: { label: '', color: '#123456' } });
    expect(entry.label).toBe('RUNNING');
    expect(entry.color).toBe('#123456');
  });

  it('resolves numeric states by key', () => {
    const map = { '1': { label: 'FOLLOWING', color: '#00ff00' } };
    expect(resolveStateEntry(1, map).label).toBe('FOLLOWING');
    expect(resolveStateEntry(1, map).color).toBe('#00ff00');
  });

  it('uses the provided fallback color when there is no entry', () => {
    expect(defaultStateEntry(1, '#abcdef').color).toBe('#abcdef');
    expect(resolveStateEntry(1, {}, '#abcdef').color).toBe('#abcdef');
    expect(resolveStateEntry('RUNNING', {}, '#abcdef').color).toBe('#abcdef');
  });

  it('sorts numeric keys before text ones', () => {
    expect(sortStateKeys(['RUNNING', '2', '10', 'IDLE'])).toEqual([
      '2',
      '10',
      'IDLE',
      'RUNNING',
    ]);
  });

  it('collects distinct state keys from frames and config', () => {
    const frames: TelemetryFrame[] = [
      { timestamp_ms: 0, data: { state: 2 } },
      { timestamp_ms: 1, data: { state: 1 } },
      { timestamp_ms: 2, data: { state: 'RUNNING' } },
      { timestamp_ms: 3, data: { state: 1 } },
    ];
    // Orden de aparición (define el color); los estados nuevos se añaden al final.
    expect(collectStateKeys(frames, 'state', {})).toEqual(['2', '1', 'RUNNING']);
    expect(
      collectStateKeys(frames, 'state', { DEBUG: { label: 'd', color: '#000000' } })
    ).toEqual(['2', '1', 'RUNNING', 'DEBUG']);
    expect(collectStateKeys([], 'state', {})).toEqual([]);
  });
});
