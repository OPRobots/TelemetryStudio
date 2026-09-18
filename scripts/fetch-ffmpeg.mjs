#!/usr/bin/env node
/**
 * Descarga binarios estáticos de FFmpeg (ffmpeg + ffprobe) a `resources/bin/`
 * para empaquetarlos como sidecar (portable, sin depender del sistema).
 *
 * Uso: node scripts/fetch-ffmpeg.mjs
 *
 * Notas:
 * - Requiere conexión a Internet (solo al preparar el empaquetado).
 * - Usa `tar`/`unzip` del sistema.
 * - Los binarios NO se versionan (ver .gitignore).
 */
import { createWriteStream } from 'fs';
import { chmod, mkdir, rm, copyFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const binDir = join(root, 'resources', 'bin');

const PLATFORMS = {
  linux: {
    binaries: ['ffmpeg', 'ffprobe'],
    artifacts: [
      {
        url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
        archive: 'ffmpeg-linux.tar.xz',
        extract: (archive, dest) =>
          spawnSync(
            'tar',
            ['-xf', archive, '-C', dest, '--strip-components=1', '--wildcards', '*/ffmpeg', '*/ffprobe'],
            { stdio: 'inherit' }
          ),
      },
    ],
  },
  darwin: {
    binaries: ['ffmpeg', 'ffprobe'],
    artifacts: [
      {
        url: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
        archive: 'ffmpeg-mac.zip',
        extract: (archive, dest) => spawnSync('tar', ['-xf', archive, '-C', dest], { stdio: 'inherit' }),
      },
      {
        url: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
        archive: 'ffprobe-mac.zip',
        extract: (archive, dest) => spawnSync('tar', ['-xf', archive, '-C', dest], { stdio: 'inherit' }),
      },
    ],
  },
  win32: {
    binaries: ['ffmpeg.exe', 'ffprobe.exe'],
    artifacts: [
      {
        url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
        archive: 'ffmpeg-win.zip',
        extract: (archive, dest) => spawnSync('tar', ['-xf', archive, '-C', dest], { stdio: 'inherit' }),
      },
    ],
  },
};

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

async function download(url, archivePath) {
  console.log(`Descargando ${url}…`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} al descargar ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
}

async function main() {
  const platform = PLATFORMS[process.platform];
  if (!platform) {
    console.error(`Plataforma no soportada: ${process.platform}`);
    process.exit(1);
  }

  await mkdir(binDir, { recursive: true });

  for (const artifact of platform.artifacts) {
    const archivePath = join(binDir, artifact.archive);
    await download(artifact.url, archivePath);
    artifact.extract(archivePath, binDir);
    await rm(archivePath, { force: true }).catch(() => undefined);
  }

  const missing = [];
  for (const name of platform.binaries) {
    const target = join(binDir, name);
    if (!existsSync(target)) {
      const found = findFile(binDir, name);
      if (found) await copyFile(found, target);
    }
    if (existsSync(target)) await chmod(target, 0o755);
    else missing.push(name);
  }
  if (missing.length > 0) {
    console.error(`Error: no se encontraron los binarios: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`FFmpeg listo en ${binDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
