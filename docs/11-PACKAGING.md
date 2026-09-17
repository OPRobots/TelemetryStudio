# Empaquetado Multiplataforma

## Herramientas

- **electron-vite 2.x** — bundler (main, preload, renderer).
- **electron-builder 25.x** — instaladores por plataforma.
- **FFmpeg sidecar** — se descarga a `resources/bin` con `scripts/fetch-ffmpeg.mjs` y se
  incluye como `extraResources`.

## Configuración real de electron-builder

`electron-builder.yml`:

```yaml
appId: com.oprobots.telemetry-studio
productName: OPRobots Telemetry Studio
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
  executableName: OPRobotsTelemetryStudio
  target: [ { target: nsis, arch: [x64] }, { target: portable, arch: [x64] } ]
mac:
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false
  target: [ { target: dmg, arch: [x64, arm64] } ]
linux:
  target: [ { target: AppImage, arch: [x64] }, { target: deb, arch: [x64] } ]
  category: Development
  maintainer: robotaleh
```

> Estado: **Linux verificado** (`--dir` arranca; AppImage ~109 MB, deb ~75 MB).
> Windows (`.exe` + portable) y macOS (`.dmg`) quedan como **build manual** hasta
> disponer de esas plataformas o de un repo remoto (ver "Pendiente").

## Comandos (package.json)

```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps",
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ tests/",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "node scripts/run-electron.mjs scripts/smoke-test.mjs",
    "e2e": "npm run e2e:serial && … && npm run e2e:comparison-reset",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build && npm run smoke && npm run e2e"
  }
}
```

El empaquetado se lanza con `electron-builder` (p. ej. `npx electron-builder --linux`).

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

`.github/workflows/build.yml` compila, pasa typecheck + tests y empaqueta en Linux,
macOS y Windows. Está **preparado pero inactivo** hasta que exista repo remoto.

## Pendiente

- Windows: `.exe` (NSIS) + portable — build manual en Windows.
- macOS: `.dmg` — build manual (PoC 4 validó el DMG).
- PoC 4: serial en las 3 plataformas empaquetadas (Windows pendiente).

## Checklist

| Paso | Windows | macOS | Linux |
|---|---|---|---|
| `asarUnpack` de `@serialport/**` | ✅ | ✅ | ✅ |
| FFmpeg sidecar (extraResources) | ✅ | ✅ | ✅ |
| Code signing | Opcional (EV cert) | Obligatorio (hardened runtime) | No aplica |
| Notarization | No aplica | Pendiente (hoy `notarize: false`) | No aplica |
| udev rules | No aplica | No aplica | Incluir en el paquete |
| Portable | target `portable` | No aplica | AppImage |
