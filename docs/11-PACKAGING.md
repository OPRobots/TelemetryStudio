# Empaquetado Multiplataforma

## Herramientas

- **electron-vite 2.x**: Bundler (compila main, preload, renderer)
- **electron-builder 25.x**: Packaging (crea instaladores por plataforma)

## Configuración electron-builder

```yaml
# electron-builder.yml
appId: "com.oprobots.telemetrystudio"
productName: "OPRobots Telemetry Studio"
copyright: "Copyright © 2026 OPRobots"

directories:
  output: "release/${version}"
  buildResources: "build"

files:
  - "out/**/*"
  - "node_modules/serialport/**/*"
  - "node_modules/@serialport/**/*"
  - "node_modules/node-addon-api/**/*"

asarUnpack:
  - "node_modules/@serialport/**"
  - "node_modules/serialport/**"
  - "node_modules/.package-lock.json"

extraResources:
  - from: "resources/fonts"
    to: "fonts"
  - from: "resources/icons"
    to: "icons"

# === WINDOWS ===
win:
  target:
    - target: "nsis"
      arch: ["x64"]
    - target: "portable"
      arch: ["x64"]
  artifactName: "${productName}-${version}-win-${arch}.${ext}"
  icon: "resources/icon.ico"

nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "OPRobots Telemetry Studio"
  installerIcon: "resources/icon.ico"
  uninstallerIcon: "resources/icon.ico"

portable:
  artifactName: "${productName}-${version}-win-portable.${ext}"

# === macOS ===
mac:
  target:
    - target: "dmg"
      arch: ["universal"]
  artifactName: "${productName}-${version}-mac.${ext}"
  icon: "resources/icon.icns"
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: "build/entitlements.mac.plist"
  entitlementsInherit: "build/entitlements.mac.plist"
  notarize: true
  mergeASARs: true
  singleArchFiles: "node_modules/@serialport/**/*.node"

dmg:
  sign: false
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: "link"
      path: "/Applications"

# === LINUX ===
linux:
  target:
    - target: "AppImage"
    - target: "deb"
  artifactName: "${productName}-${version}-linux-${arch}.${ext}"
  icon: "resources/icon.png"
  category: "Development"
  synopsis: "Telemetry analysis and video sync for competition robots"
  description: "OPRobots Telemetry Studio is a desktop application for analyzing robot telemetry data with synchronized video playback."
  maintainer: "OPRobots Team <team@oprobots.com>"

deb:
  depends:
    - "libgtk-3-0"
    - "libnotify4"
    - "libnss3"
    - "libxss1"
    - "libxtst6"
    - "xdg-utils"
    - "libatspi2.0-0"
    - "libuuid1"
    - "libsecret-1-0"

appImage:
  artifactName: "${productName}-${version}-linux.${ext}"
```

## Configuración de entitlements macOS

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.device.serial</key>
    <true/>
    <key>com.apple.security.device.usb</key>
    <true/>
</dict>
</plist>
```

## Scripts de package.json

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps",
    "rebuild": "electron-rebuild -f -w serialport",
    "build:win": "electron-vite build && electron-builder --win --config",
    "build:mac": "electron-vite build && electron-builder --mac --config",
    "build:linux": "electron-vite build && electron-builder --linux --config",
    "build:all": "electron-vite build && electron-builder --win --mac --linux --config",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Udev Rules para Linux

Incluir en el paquete de distribución un archivo de reglas udev para acceso a puertos serie sin root:

```udev
# resources/udev/69-oprobots-serial.rules
# OPRobots — Permisos de acceso a puertos serie para usuarios en grupo 'dialout'

# FTDI (FT232R, FT232H)
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0666", GROUP="dialout"

# SiLabs CP210x
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", MODE="0666", GROUP="dialout"

# CH340/CH341
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", MODE="0666", GROUP="dialout"

# Prolific PL2303
SUBSYSTEM=="tty", ATTRS{idVendor}=="067b", MODE="0666", GROUP="dialout"

# STM32 ST-Link VCP
SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", MODE="0666", GROUP="dialout"

# Generic CDC-ACM (USB Console)
SUBSYSTEM=="tty", ATTRS{bInterfaceClass}=="02", MODE="0666", GROUP="dialout"
```

**Instalación en Linux:**
```bash
sudo cp resources/udev/69-oprobots-serial.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -a -G dialout $USER
# Cerrar sesión y volver a entrar
```

## CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/build.yml
name: Build & Release

on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-rebuild -f -w serialport
      - run: npm run build:win
      - uses: actions/upload-artifact@v4
        with:
          name: windows-builds
          path: release/*.exe

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-rebuild -f -w serialport
      - run: npm run build:mac
        env:
          CSC_LINK: ${{ secrets.MAC_CERT_P12 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v4
        with:
          name: mac-builds
          path: release/*.dmg

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx electron-rebuild -f -w serialport
      - run: npm run build:linux
      - uses: actions/upload-artifact@v4
        with:
          name: linux-builds
          path: |
            release/*.AppImage
            release/*.deb
```

## Checklist de Empaquetado

| Paso | Windows | macOS | Linux |
|---|---|---|---|
| `electron-rebuild -f -w serialport` | ✅ | ✅ | ✅ |
| `asarUnpack` para `@serialport/**` | ✅ | ✅ | ✅ |
| Code signing | Opcional (EV cert recomendado) | Obligatorio (hardened runtime) | No aplica |
| Notarization | No aplica | Obligatorio (Apple) | No aplica |
| VC++ Redistributable | Incluir en NSIS installer | No aplica | No aplica |
| udev rules | No aplica | No aplica | Incluir en paquete |
| Portable build | NSIS portable | No aplica | AppImage (ya es portable) |
| Universal binary | No aplica | `arch: ["universal"]` | No aplica |
