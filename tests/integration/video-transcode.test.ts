import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { buildTranscodeArgs, parseFfmpegProgress, transcodePercent } from '@shared/video-transcode';

function hasBinary(name: string): boolean {
  return spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0;
}

const FFMPEG = hasBinary('ffmpeg');
const dir = '/tmp/opencode';

function runCapture(binary: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

describe.skipIf(!FFMPEG)('Integración: progreso de conversión', () => {
  it('reporta progreso al transcode un vídeo', async () => {
    mkdirSync(dir, { recursive: true });
    const input = join(dir, 'progress-in.mp4');
    const output = join(dir, 'progress-out.mp4');
    rmSync(input, { force: true });
    rmSync(output, { force: true });

    const generated = await runCapture('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x90:rate=10',
      '-t',
      '2',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);
    expect(generated.code).toBe(0);

    const percents: number[] = [];
    const code = await new Promise<number>((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
        [
          '-progress',
          'pipe:1',
          '-nostats',
          ...buildTranscodeArgs({ inputPath: input, outputPath: output }),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let buffered = '';
      proc.stdout.on('data', (chunk) => {
        buffered += chunk.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          const us = parseFfmpegProgress(line);
          if (us !== null) percents.push(transcodePercent(us, 2));
        }
      });
      proc.on('error', reject);
      proc.on('close', (c) => resolve(c ?? -1));
    });

    expect(code).toBe(0);
    expect(existsSync(output)).toBe(true);
    expect(percents.length).toBeGreaterThan(0);
    expect(Math.max(...percents)).toBeGreaterThan(0);
  }, 30000);
});
