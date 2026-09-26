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

  it('maps the anchored frame to telemetry t=0', () => {
    sync.setAnchorPoint(3000, 0);
    expect(sync.mapTime(3000)).toBe(0);
    expect(sync.mapTime(5000)).toBe(2000);
    expect(sync.mapTime(2000)).toBe(-1000);
  });

  it('unmaps telemetry time back to video time', () => {
    expect(sync.unmapTime(1000)).toBe(1000);
    sync.setDriftOffset(250);
    expect(sync.unmapTime(1250)).toBe(1000);
    sync.setDriftOffset(0);
    sync.setAnchorPoint(2000, 5000);
    expect(sync.unmapTime(5000)).toBe(2000);
    expect(sync.unmapTime(5500)).toBe(2500);
    expect(sync.unmapTime(4000)).toBe(1000);
  });

  it('unmapTime is the inverse of mapTime', () => {
    sync.setDriftOffset(100);
    sync.setAnchorPoint(2000, 5000);
    for (const mediaTime of [0, 500, 2000, 3000, 9999]) {
      expect(sync.unmapTime(sync.mapTime(mediaTime))).toBe(mediaTime);
    }
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

  it('keeps state independent across synchronizer instances', () => {
    const primary = new VideoSynchronizer();
    const comparison = new VideoSynchronizer({
      frameEvent: 'comparison:frame',
      dataset: 'comparison',
    });

    primary.setDriftOffset(100);
    comparison.setDriftOffset(200);
    primary.setAnchorPoint(0, 0);
    comparison.setAnchorPoint(0, 5000);

    expect(primary.mapTime(1000)).toBe(1100);
    expect(comparison.mapTime(1000)).toBe(6200);
    expect(primary.driftOffset).toBe(100);
    expect(comparison.driftOffset).toBe(200);
  });

  it('seekToStart aplica el seek cuando el vídeo ya tiene metadatos', () => {
    const sync = new VideoSynchronizer();
    const { video } = makeFakeVideo(1);
    sync.attach(video);
    sync.seekToStart(3.5);
    expect(video.currentTime).toBe(3.5);
  });

  it('seekToStart espera a loadedmetadata si el vídeo no está listo', () => {
    const sync = new VideoSynchronizer();
    const { video, emit } = makeFakeVideo(0);
    sync.attach(video);
    sync.seekToStart(4);
    expect(video.currentTime).toBe(0);
    emit('loadedmetadata');
    expect(video.currentTime).toBe(4);
  });

  it('attach aplica un seek pendiente solicitado antes de adjuntar', () => {
    const sync = new VideoSynchronizer();
    const { video } = makeFakeVideo(1);
    sync.seekToStart(2);
    sync.attach(video);
    expect(video.currentTime).toBe(2);
  });

  it('clearAnchor cancela un seek pendiente', () => {
    const sync = new VideoSynchronizer();
    const { video, emit } = makeFakeVideo(0);
    sync.attach(video);
    sync.seekToStart(5);
    sync.clearAnchor();
    emit('loadedmetadata');
    expect(video.currentTime).toBe(0);
  });
});

function makeFakeVideo(readyState: number): {
  video: HTMLVideoElement;
  emit: (type: string) => void;
} {
  const listeners = new Map<string, Array<() => void>>();
  const video = {
    readyState,
    duration: 10,
    currentTime: 0,
    videoWidth: 1920,
    videoHeight: 1080,
    playbackRate: 1,
    paused: true,
    requestVideoFrameCallback: (): number => 0,
    cancelVideoFrameCallback: (): void => undefined,
    addEventListener: (type: string, cb: () => void): void => {
      const arr = listeners.get(type) ?? [];
      arr.push(cb);
      listeners.set(type, arr);
    },
    removeEventListener: (): void => undefined,
  } as unknown as HTMLVideoElement;
  return {
    video,
    emit: (type: string): void => {
      for (const cb of listeners.get(type) ?? []) cb();
    },
  };
}
