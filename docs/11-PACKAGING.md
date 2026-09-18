# Empaquetado Multiplataforma

## Herramientas

- **electron-vite 2.x** — bundler (main, preload, renderer).
- **electron-builder 25.x** — instaladores por plataforma.
- **FFmpeg sidecar** — se descarga a `resources/bin` con `scripts/fetch-ffmpeg.mjs` y se
  incluye como `extraResources`.

## Configuración real de electron-builder

`electron-builder.yml`:

```yaml
appId: org.oprobots.telemetry-studio
productName: Telemetry Studio
directories: { buildResources: build }
files:
  - "out/**/*"
  - "!**/.vscode/*"
  - "!src/*"
  - "!electron.vite.config.*"
extraResources:
  - { from: resources/bin,  to: bin,  filter: ["**/*", "!.gitkeep"] }  # FFmpeg sidecar
  - { from: resources/udev, to: udev, filter: ["**/*"] }               # reglas udev Linux
asarUnpack:
  - "node_modules/@serialport/**"
  - "node_modules/serialport/**"
  - "node_modules/.cache/**"
  - "**/*.node"
win:
  executableName: TelemetryStudio
  target: [ { target: nsis, arch: [x64] }, { target: portable, arch: [x64] } ]
mac:
  category: public.app-category.utilities
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo: { … }              # DEBE ser un mapa (no una lista `- clave: valor`)
  notarize: false
  target: [ { target: dmg, arch: [x64, arm64] } ]
linux:
  target: [ { target: AppImage, arch: [x64] }, { target: deb, arch: [x64] } ]
  category: Development
  maintainer: robotaleh
publish:
  provider: github
  owner: OPRObots
  repo: TelemetryStudio
  releaseType: draft
```

> Los artefactos se nombran `${name}-${version}[-${arch}].${ext}`. El `mac` usa
> `${arch}` porque genera **dos DMGs** (x64 y arm64); sin él colisionarían.
>
> Estado: **Linux verificado** (AppImage y deb arrancan con el sidecar FFmpeg
> incluido; ~168 MB y ~117 MB respectivamente por los binarios de FFmpeg).
> Windows/macOS se generan en CI (ver más abajo); quedan sin firmar en esta fase.
>
> **macOS**: se generan **dos DMGs** (x64 y arm64), no un binario universal. No es
> necesario un universal: `@serialport/bindings-cpp` incluye un prebuild *fat*
> (`darwin-x64+arm64`) y cada DMG usa su rebanada (ver `docs/12-LIMITATIONS.md` #5).

## Comandos (package.json)

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ tests/",
    "test": "vitest run",
    "smoke": "node scripts/run-electron.mjs scripts/smoke-test.mjs",
    "e2e": "npm run e2e:serial && … && npm run e2e:layouts",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build && npm run smoke && npm run e2e",
    "dist:linux": "npm run build && electron-builder --linux",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win"
  }
}
```

El empaquetado se lanza con `electron-builder` (p. ej. `npx electron-builder --linux`).

## Módulos nativos

`@serialport/bindings-cpp` es **N-API** y trae binarios en `prebuilds/` para todas
las plataformas objetivo (`darwin-x64+arm64`, `win32-x64`, `linux-x64`, …), así
que **no** se reconstruye: `npmRebuild: false` en `electron-builder.yml` y **sin**
`postinstall`. Evita `node-gyp`, que en CI falla por `distutils` ausente (macOS
con Python 3.12+) y por no encontrar Visual Studio (Windows).

## Entitlements macOS

`build/entitlements.mac.plist` habilita JIT, memoria ejecutable, variables dyld y
acceso a serial/USB (necesario para `serialport` con hardened runtime).

## Udev rules (Linux)

`resources/udev/69-oprobots-serial.rules` da permisos al grupo `dialout` para los
chipsets habituales (FTDI, CP210x, CH340, PL2303, ST-Link VCP y CDC-ACM genérico).

```bash
sudo cp resources/udev/69-oprobots-serial.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -a -G dialout $USER   # cerrar sesión y volver a entrar
```

## CI/CD (GitHub Actions)

Dos workflows:

- **`.github/workflows/ci.yml`** — en push a `main` y PR: instalación, lint,
  typecheck, tests, descarga del sidecar FFmpeg y build. En Linux (Ubuntu) además
  ejecuta `smoke` + `e2e` bajo `xvfb`.
- **`.github/workflows/release.yml`** — al empujar un tag `vX.Y.Z`: matriz
  Ubuntu/macOS/Windows → `electron-builder --publish always` con `GH_TOKEN`,
  subiendo los instaladores a un **GitHub Release en borrador** (revisar y
  publicar). `CSC_IDENTITY_AUTO_DISCOVERY=false`: sin firma en esta fase.

Artefactos por plataforma:

| Plataforma | Targets | Arch |
|---|---|---|
| Linux | AppImage, deb | x64 |
| Windows | NSIS (setup), portable | x64 |
| macOS | DMG | x64 + arm64 |

## Pendiente

- Firma de código: macOS (hardened runtime + notarización) y Windows (certificado).
- PoC 4: serial en las 3 plataformas empaquetadas (Windows/macOS sin verificar).

## Checklist

| Paso | Windows | macOS | Linux |
|---|---|---|---|
| `asarUnpack` de `@serialport/**` | ✅ | ✅ | ✅ |
| FFmpeg sidecar (extraResources) | ✅ | ✅ | ✅ |
| Code signing | Opcional (EV cert) | Obligatorio (hardened runtime) | No aplica |
| Notarization | No aplica | Pendiente (hoy `notarize: false`) | No aplica |
| udev rules | No aplica | No aplica | Incluir en el paquete |
| Portable | target `portable` | No aplica | AppImage |
