#!/usr/bin/env node
// Regenera los iconos de la app a partir de build/icon.svg:
//   build/icon.png  -> ventana en runtime (extraResources) + Linux
//   build/icon.ico  -> Windows (exe, instalador, barra de tareas)
//   build/icon.icns -> macOS (bundle)
// Requiere: rsvg-convert (librsvg) e ImageMagick.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const svg = join(root, 'build/icon.svg')
const png = join(root, 'build/icon.png')
const ico = join(root, 'build/icon.ico')
const icns = join(root, 'build/icon.icns')

const render = (size, out) =>
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', out], {
    stdio: 'inherit',
  })

render(1024, png)
execFileSync('convert', [png, '-define', 'icon:auto-resize=256,128,64,48,32,16', ico], {
  stdio: 'inherit',
})

const tmp = mkdtempSync(join(tmpdir(), 'telemetry-icons-'))
try {
  const sizes = new Map()
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const out = join(tmp, `icon_${size}.png`)
    render(size, out)
    sizes.set(size, readFileSync(out))
  }

  // Tipos OSType de ICNS (nombre -> tamaño en px). Incluye variantes @1x/@2x.
  const types = [
    ['icp4', 16],
    ['ic11', 32],
    ['icp5', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024],
  ]

  const chunks = types.map(([type, size]) => {
    const data = sizes.get(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const body = Buffer.concat(chunks)
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 'ascii')
  fileHeader.writeUInt32BE(body.length + 8, 4)
  writeFileSync(icns, Buffer.concat([fileHeader, body]))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('Iconos generados: build/icon.png, build/icon.ico, build/icon.icns')
