#!/usr/bin/env node
/**
 * Lanzador de Electron para los scripts de verificación.
 *
 * - Resuelve el binario de Electron del proyecto.
 * - Fuerza una config mínima de fontconfig (scripts/fonts.conf) si existe.
 * - Filtra el ruido ambiental de fontconfig/GTK (stderr), que depende del
 *   sistema operativo y no de la aplicación.
 * - Propaga el código de salida del proceso hijo.
 *
 * Uso: node scripts/run-electron.mjs <script-electron.mjs> [args...]
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const electronPath = require('electron');
const args = process.argv.slice(2);

const env = { ...process.env };
// Los avisos de seguridad de Electron son solo de desarrollo y dependen de
// webSecurity:false (necesario para cargar vídeo local en dev). Se silencian.
env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
const fontsConf = join(root, 'scripts', 'fonts.conf');
if (existsSync(fontsConf)) {
  env.FONTCONFIG_FILE = fontsConf;
}

const NOISE = /fontconfig|Gtk-Message|Failed to load module|libva|dri3|vaapi|ffmpeg_common|Unsupported pixel format/i;

// En CI (xvfb) el sandbox y la GPU no están disponibles.
const flags = ['--no-sandbox'];
if (process.env.CI) flags.push('--disable-gpu');

const child = spawn(electronPath, [...args, ...flags], {
  stdio: ['inherit', 'inherit', 'pipe'],
  env,
});

let stderrBuffer = '';
child.stderr.on('data', (chunk) => {
  stderrBuffer += chunk.toString();
  const lines = stderrBuffer.split('\n');
  stderrBuffer = lines.pop() ?? '';
  for (const line of lines) {
    if (NOISE.test(line)) continue;
    process.stderr.write(`${line}\n`);
  }
});

child.on('close', (code) => {
  if (stderrBuffer && !NOISE.test(stderrBuffer)) process.stderr.write(stderrBuffer);
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('No se pudo lanzar Electron:', err.message);
  process.exit(1);
});
