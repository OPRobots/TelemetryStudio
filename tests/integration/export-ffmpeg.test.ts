import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import { existsSync, statSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildFfmpegArgs } from '@shared/export-args';

function hasBinary(name: string): boolean {
  const res = spawnSync(name, ['-version'], { stdio: 'ignore' });
  return res.status === 0;
}

const FFMPEG = hasBinary('ffmpeg');
const FFPROBE = hasBinary('ffprobe');
const outputDir = '/tmp/opencode';
const outputPath = join(outputDir, 'export-integration.mp4');

function writeFramesToFfmpeg(
  args: string[],
  width: number,
  height: number,
  frames: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr += d.toString()));

    const frameBytes = Buffer.alloc(width * height * 4);
    for (let i = 0; i < frames; i++) {
      // Gradiente simple para que no sea un frame vacío
      for (let p = 0; p < frameBytes.length; p += 4) {
        frameBytes[p] = (i * 8) % 256;
        frameBytes[p + 1] = (p / 4) % 256;
        frameBytes[p + 2] = 128;
        frameBytes[p + 3] = 255;
      }
      const ok = proc.stdin!.write(frameBytes);
      if (!ok) {
        // backpressure: esperar drain antes de seguir
        proc.stdin!.once('drain', () => undefined);
      }
    }
    proc.stdin!.end();

    proc.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`FFmpeg code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

describe.skipIf(!FFMPEG)('Integración: exportación con FFmpeg', () => {
  it('codifica frames raw RGBA en un MP4 válido', async () => {
    mkdirSync(outputDir, { recursive: true });
    if (existsSync(outputPath)) rmSync(outputPath);

    const width = 160;
    const height = 90;
    const fps = 10;
    const frames = 10;

    const args = buildFfmpegArgs({
      width,
      height,
      fps,
      format: 'mp4',
      codec: 'h264',
      outputPath,
    });

    await writeFramesToFfmpeg(args, width, height, frames);

    expect(existsSync(outputPath)).toBe(true);
    expect(statSync(outputPath).size).toBeGreaterThan(0);

    if (FFPROBE) {
      const probe = spawnSync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', outputPath],
        { encoding: 'utf-8' }
      );
      expect(probe.stdout.trim()).toBe(`${width},${height}`);
    }
  }, 30000);
});
