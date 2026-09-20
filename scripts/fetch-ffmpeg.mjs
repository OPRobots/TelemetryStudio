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
 * - macOS: descarga las variantes x86_64 y arm64 y las fusiona con `lipo` en un
 *   binario universal, para que el mismo sidecar sirva a los DMGs x64 y arm64.
 *   Los binarios se firman en modo ad-hoc (Apple Silicon exige firma válida).
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

// Fuentes por arquitectura para el sidecar universal de macOS.
// x64: evermeet.cx (builds Intel). arm64: osxexperts.net (builds Apple Silicon).
const DARWIN_SOURCES = [
  {
    name: 'ffmpeg',
    x64: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
    arm64: 'https://www.osxexperts.net/ffmpeg9arm.zip',
  },
  {
    name: 'ffprobe',
    x64: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
    arm64: 'https://www.osxexperts.net/ffprobe9arm.zip',
  },
];

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

/**
 * Descarga las variantes x64/arm64 de cada binario, las fusiona con `lipo` en
 * un ejecutable universal y lo firma ad-hoc.
 */
async function fetchDarwinUniversal() {
  for (const { name, x64, arm64 } of DARWIN_SOURCES) {
    const workDirs = [];
    const slices = [];

    for (const [arch, url] of [
      ['x64', x64],
      ['arm64', arm64],
    ]) {
      const workDir = join(binDir, `.tmp-${name}-${arch}`);
      workDirs.push(workDir);
      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });

      const archivePath = join(workDir, 'download.zip');
      await download(url, archivePath);
      const extracted = spawnSync('tar', ['-xf', archivePath, '-C', workDir], { stdio: 'inherit' });
      if (extracted.status !== 0) throw new Error(`No se pudo extraer ${url}`);

      let binaryPath = join(workDir, name);
      if (!existsSync(binaryPath)) {
        const found = findFile(workDir, name);
        if (!found) throw new Error(`No se encontró ${name} en ${url}`);
        binaryPath = found;
      }
      slices.push(binaryPath);
    }

    const target = join(binDir, name);
    const lipo = spawnSync('lipo', ['-create', ...slices, '-output', target], { stdio: 'inherit' });
    if (lipo.status !== 0) throw new Error(`lipo falló al crear ${name} universal`);

    const signed = spawnSync('codesign', ['--force', '--sign', '-', target], { stdio: 'inherit' });
    if (signed.status !== 0) throw new Error(`codesign falló al firmar ${name}`);

    await chmod(target, 0o755);
    for (const workDir of workDirs) {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  await mkdir(binDir, { recursive: true });

  if (process.platform === 'darwin') {
    await fetchDarwinUniversal();
    console.log(`FFmpeg universal (x86_64 + arm64) listo en ${binDir}`);
    return;
  }

  const platform = PLATFORMS[process.platform];
  if (!platform) {
    console.error(`Plataforma no soportada: ${process.platform}`);
    process.exit(1);
  }

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
