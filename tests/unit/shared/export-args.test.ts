import { describe, it, expect } from 'vitest';
import { buildFfmpegArgs, ffmpegBinaryName } from '@shared/export-args';

describe('buildFfmpegArgs', () => {
  it('builds H.264 MP4 args with raw RGBA input from stdin', () => {
    const args = buildFfmpegArgs({
      width: 1280,
      height: 720,
      fps: 30,
      format: 'mp4',
      codec: 'h264',
      outputPath: '/tmp/out.mp4',
    });

    expect(args).toContain('-f');
    expect(args[args.indexOf('-f') + 1]).toBe('rawvideo');
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('rgba');
    expect(args[args.indexOf('-s') + 1]).toBe('1280x720');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
    expect(args[args.indexOf('-i') + 1]).toBe('pipe:0');
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  it('builds VP9 WebM args', () => {
    const args = buildFfmpegArgs({
      width: 640,
      height: 360,
      fps: 24,
      format: 'webm',
      codec: 'vp9',
      outputPath: '/tmp/out.webm',
    });

    expect(args).toContain('libvpx-vp9');
    expect(args).not.toContain('libx264');
    expect(args[args.length - 1]).toBe('/tmp/out.webm');
  });

  it('honours a custom CRF', () => {
    const args = buildFfmpegArgs({
      width: 320,
      height: 240,
      fps: 10,
      format: 'mp4',
      codec: 'h264',
      outputPath: '/tmp/out.mp4',
      crf: 25,
    });
    expect(args[args.indexOf('-crf') + 1]).toBe('25');
  });
});

describe('ffmpegBinaryName', () => {
  it('uses ffmpeg.exe on Windows', () => {
    expect(ffmpegBinaryName('win32')).toBe('ffmpeg.exe');
  });
  it('uses ffmpeg elsewhere', () => {
    expect(ffmpegBinaryName('linux')).toBe('ffmpeg');
    expect(ffmpegBinaryName('darwin')).toBe('ffmpeg');
  });
});
