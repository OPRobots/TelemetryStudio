import { describe, it, expect } from 'vitest';
import {
  buildTranscodeArgs,
  fpsFromRatio,
  parseFfmpegProgress,
  transcodePercent,
} from '@shared/video-transcode';

describe('buildTranscodeArgs', () => {
  it('construye argumentos libx264 con faststart', () => {
    const args = buildTranscodeArgs({ inputPath: '/in.mov', outputPath: '/out.mp4' });
    expect(args[args.indexOf('-i') + 1]).toBe('/in.mov');
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(args[args.length - 1]).toBe('/out.mp4');
  });

  it('respeta crf y preset', () => {
    const args = buildTranscodeArgs({
      inputPath: 'a',
      outputPath: 'b',
      crf: 28,
      preset: 'medium',
    });
    expect(args[args.indexOf('-crf') + 1]).toBe('28');
    expect(args[args.indexOf('-preset') + 1]).toBe('medium');
  });
});

describe('transcodePercent', () => {
  it('calcula el porcentaje a partir del tiempo de salida', () => {
    expect(transcodePercent(5_000_000, 10)).toBe(50);
    expect(transcodePercent(0, 10)).toBe(0);
  });

  it('nunca llega a 100 hasta finalizar y respeta el rango', () => {
    expect(transcodePercent(10_000_000, 10)).toBe(99);
    expect(transcodePercent(20_000_000, 10)).toBe(99);
  });

  it('devuelve 0 si la duración es desconocida o inválida', () => {
    expect(transcodePercent(5_000_000, 0)).toBe(0);
    expect(transcodePercent(5_000_000, -1)).toBe(0);
    expect(transcodePercent(NaN, 10)).toBe(0);
  });
});

describe('parseFfmpegProgress', () => {
  it('extrae out_time_us de una línea de -progress', () => {
    expect(parseFfmpegProgress('out_time_us=2500000')).toBe(2_500_000);
    expect(parseFfmpegProgress('frame=42')).toBeNull();
    expect(parseFfmpegProgress('progress=continue')).toBeNull();
  });

  it('encadena con transcodePercent', () => {
    const us = parseFfmpegProgress('out_time_us=5000000');
    expect(us).not.toBeNull();
    expect(transcodePercent(us as number, 10)).toBe(50);
  });
});

describe('fpsFromRatio', () => {
  it('convierte ratios enteros', () => {
    expect(fpsFromRatio('60/1')).toBe(60);
    expect(fpsFromRatio('30/1')).toBe(30);
    expect(fpsFromRatio('25')).toBe(25);
  });

  it('convierte ratios NTSC', () => {
    expect(fpsFromRatio('30000/1001')).toBeCloseTo(29.97, 2);
    expect(fpsFromRatio('60000/1001')).toBeCloseTo(59.94, 2);
  });

  it('devuelve 0 para valores inválidos', () => {
    expect(fpsFromRatio('0/1')).toBe(0);
    expect(fpsFromRatio('60/0')).toBe(0);
    expect(fpsFromRatio('abc')).toBe(0);
    expect(fpsFromRatio('')).toBe(0);
    expect(fpsFromRatio(null)).toBe(0);
    expect(fpsFromRatio(undefined)).toBe(0);
  });
});
