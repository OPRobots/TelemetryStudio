import { describe, it, expect, beforeEach } from 'vitest';
import { VideoSynchronizer, installRvfcPolyfill } from '@core/video-synchronizer';
import { telemetryStore } from '@core/telemetry-store';

describe('VideoSynchronizer', () => {
  let sync: VideoSynchronizer;

  beforeEach(() => {
    sync = new VideoSynchronizer();
    telemetryStore.clear();
  });

  it('maps time unchanged with no offset or anchor', () => {
    expect(sync.mapTime(1000)).toBe(1000);
  });

  it('applies a positive drift offset', () => {
    sync.setDriftOffset(250);
    expect(sync.mapTime(1000)).toBe(1250);
    expect(sync.driftOffset).toBe(250);
  });

  it('applies a negative drift offset', () => {
    sync.setDriftOffset(-300);
    expect(sync.mapTime(1000)).toBe(700);
  });

  it('applies an anchor point', () => {
    sync.setAnchorPoint(2000, 5000);
    expect(sync.mapTime(2000)).toBe(5000);
    expect(sync.mapTime(2500)).toBe(5500);
    expect(sync.mapTime(1000)).toBe(4000);
    expect(sync.anchor).toEqual({ video_ms: 2000, telemetry_ms: 5000 });
  });

  it('combines offset and anchor', () => {
    sync.setDriftOffset(100);
    sync.setAnchorPoint(2000, 5000);
    expect(sync.mapTime(2000)).toBe(5100);
  });

  it('clears the anchor', () => {
    sync.setAnchorPoint(1, 2);
    sync.clearAnchor();
    expect(sync.anchor).toBeNull();
    expect(sync.mapTime(1000)).toBe(1000);
  });

  it('tracks drift statistics', () => {
    expect(sync.averageDrift).toBe(0);
    expect(sync.maxDrift).toBe(0);
    sync.resetStats();
    expect(sync.averageDrift).toBe(0);
  });

  it('only sets valid playback rate bounds', () => {
    // Sin elemento de vídeo no debe lanzar
    expect(() => sync.setPlaybackRate(5)).not.toThrow();
    expect(() => sync.setDeclaredFps(0)).not.toThrow();
  });

  it('installRvfcPolyfill is safe without HTMLVideoElement', () => {
    expect(() => installRvfcPolyfill()).not.toThrow();
  });
});
