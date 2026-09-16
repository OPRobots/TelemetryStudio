import { describe, it, expect } from 'vitest';
import {
  isReceivingData,
  serialStatusLabel,
  sessionSaveStatus,
  STALE_TRANSMISSION_MS,
} from '@renderer/lib/session-save-status';

describe('isReceivingData', () => {
  it('es true con puerto abierto y dato reciente', () => {
    expect(isReceivingData({ serialConnected: true, lastDataAt: 1000, now: 4000 })).toBe(true);
  });

  it('es false cuando el dato es antiguo', () => {
    expect(
      isReceivingData({ serialConnected: true, lastDataAt: 1000, now: 1000 + STALE_TRANSMISSION_MS })
    ).toBe(false);
  });

  it('es false sin conexión o sin datos', () => {
    expect(isReceivingData({ serialConnected: false, lastDataAt: 1000, now: 2000 })).toBe(false);
    expect(isReceivingData({ serialConnected: true, lastDataAt: null, now: 2000 })).toBe(false);
  });
});

describe('serialStatusLabel', () => {
  it('desconectado', () => {
    expect(serialStatusLabel({ serialConnected: false, lastDataAt: null, now: 0 })).toBe(
      'desconectado'
    );
  });

  it('grabando con datos recientes', () => {
    expect(serialStatusLabel({ serialConnected: true, lastDataAt: 1000, now: 3000 })).toBe(
      'grabando'
    );
  });

  it('en reposo tras el umbral de silencio', () => {
    expect(
      serialStatusLabel({
        serialConnected: true,
        lastDataAt: 1000,
        now: 1000 + STALE_TRANSMISSION_MS + 1,
      })
    ).toBe('en reposo');
  });
});

describe('sessionSaveStatus', () => {
  it('bloquea sin datos', () => {
    const status = sessionSaveStatus({
      frameCount: 0,
      serialConnected: false,
      lastDataAt: null,
      now: 0,
    });
    expect(status.canSave).toBe(false);
    expect(status.reason).toContain('No hay telemetría');
  });

  it('bloquea mientras se reciben datos, explicando el motivo', () => {
    const status = sessionSaveStatus({
      frameCount: 100,
      serialConnected: true,
      lastDataAt: 5000,
      now: 8000,
    });
    expect(status.canSave).toBe(false);
    expect(status.reason).toContain('se siguen recibiendo datos');
  });

  it('permite guardar tras el umbral de silencio', () => {
    const status = sessionSaveStatus({
      frameCount: 100,
      serialConnected: true,
      lastDataAt: 1000,
      now: 1000 + STALE_TRANSMISSION_MS + 1,
    });
    expect(status.canSave).toBe(true);
    expect(status.reason).toBeNull();
  });

  it('permite guardar con datos y puerto desconectado', () => {
    const status = sessionSaveStatus({
      frameCount: 100,
      serialConnected: false,
      lastDataAt: 1000,
      now: 2000,
    });
    expect(status.canSave).toBe(true);
  });
});
