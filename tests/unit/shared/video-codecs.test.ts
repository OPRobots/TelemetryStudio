import { describe, it, expect } from 'vitest';
import { isPlayableVideoCodec } from '@shared/video-codecs';

describe('isPlayableVideoCodec', () => {
  it('accepts H.264', () => {
    expect(isPlayableVideoCodec('h264')).toBe(true);
    expect(isPlayableVideoCodec('avc1')).toBe(true);
  });

  it('accepts VP9, VP8 and AV1', () => {
    expect(isPlayableVideoCodec('vp9')).toBe(true);
    expect(isPlayableVideoCodec('vp8')).toBe(true);
    expect(isPlayableVideoCodec('av1')).toBe(true);
  });

  it('rejects HEVC/H.265', () => {
    expect(isPlayableVideoCodec('hevc')).toBe(false);
    expect(isPlayableVideoCodec('h265')).toBe(false);
  });

  it('treats unknown codecs as playable (deja intentarlo al navegador)', () => {
    expect(isPlayableVideoCodec(null)).toBe(true);
    expect(isPlayableVideoCodec(undefined)).toBe(true);
    expect(isPlayableVideoCodec('')).toBe(true);
  });
});
