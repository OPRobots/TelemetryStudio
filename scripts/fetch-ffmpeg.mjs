#!/usr/bin/env node
/**
 * Descarga un binario estático de FFmpeg a `resources/bin/` para empaquetarlo
 * como sidecar (portable, sin depender del FFmpeg del sistema).
 *
 * Uso: node scripts/fetch-ffmpeg.mjs
 *
 * Notas:
 * - Requiere conexión a Internet (solo se ejecuta al preparar el empaquetado).
 * - Usa `tar` (Linux/macOS) o PowerShell (Windows) para extraer.
 * - El binario resultante NO se versiona (ver .gitignore).
 */
import { createWriteStream } from 'fs';
import { chmod, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const binDir = join(root, 'resources', 'bin');

const SOURCES = {
  linux: {
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    archive: 'ffmpeg-linux.tar.xz',
    extract: (archive, dest) => {
      // El tar contiene una carpeta ffmpeg-*-amd64-static con el binario
      spawnSync('tar', ['-xf', archive, '-C', dest, '--strip-components=1', '--wildcards', '*/ffmpeg'], { stdio: 'inherit' });
    },
    binary: 'ffmpeg',
  },
  darwin: {
    url: 'https://evermeet.cx/ffmpeg/getrelease/zip',
    archive: 'ffmpeg-mac.zip',
    extract: (archive, dest) => {
      spawnSync('unzip', ['-o', archive, '-d', dest], { stdio: 'inherit' });
    },
    binary: 'ffmpeg',
  },
  win32: {
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    archive: 'ffmpeg-win.zip',
    extract: (archive, dest) => {
      spawnSync('unzip', ['-o', archive, '-d', dest], { stdio: 'inherit' });
    },
    binary: 'ffmpeg.exe',
  },
};

async function main() {
  const source = SOURCES[process.platform];
  if (!source) {
    console.error(`Plataforma no soportada: ${process.platform}`);
    process.exit(1);
  }

  await mkdir(binDir, { recursive: true });
  const archivePath = join(binDir, source.archive);

  console.log(`Descargando FFmpeg para ${process.platform}…`);
  const response = await fetch(source.url);
  if (!response.ok || !response.body) {
    console.error(`No se pudo descargar: HTTP ${response.status}`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));

  console.log('Extrayendo…');
  source.extract(archivePath, binDir);

  // Buscar el binario en subcarpetas (los ZIP de Windows/macOS suelen anidar)
  const target = join(binDir, source.binary);
  if (!existsSync(target)) {
    const found = findBinary(binDir, source.binary);
    if (found) {
      spawnSync('cp', [found, target]);
    }
  }

  await rm(archivePath, { force: true }).catch(() => undefined);
  if (existsSync(target)) {
    await chmod(target, 0o755);
    console.log(`FFmpeg listo en ${target}`);
  } else {
    console.error('No se encontró el binario de FFmpeg tras extraer.');
    process.exit(1);
  }
}

function findBinary(dir, name) {
  const resultado = spawnSync('find', [dir, '-name', name, '-type', 'f'], { encoding: 'utf-8' });
  const first = resultado.stdout?.trim().split('\n')[0];
  return first || null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
