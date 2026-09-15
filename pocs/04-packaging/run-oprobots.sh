#!/bin/bash
# OPRobots Telemetry Studio — Launcher
# Auto-extrae el AppImage si FUSE no está disponible

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIMAGE="$(ls "$SCRIPT_DIR"/*.AppImage 2>/dev/null | head -1)"
EXTRACT_DIR="$SCRIPT_DIR/.oprobots-extracted"

if [ -z "$APPIMAGE" ]; then
  echo "Error: No se encontró el AppImage en $SCRIPT_DIR"
  exit 1
fi

# Check FUSE availability
if command -v fusermount &>/dev/null && fusermount -V &>/dev/null 2>&1; then
  exec "$APPIMAGE" "$@"
fi

# FUSE not available — extract and run
echo "FUSE no disponible. Usando modo extraído..."
mkdir -p "$EXTRACT_DIR"

if [ ! -f "$EXTRACT_DIR/oprobots-telemetry-studio" ]; then
  echo "Extrayendo AppImage (primera vez)..."
  "$APPIMAGE" --appimage-extract >/dev/null 2>&1
  mv squashfs-root/* "$EXTRACT_DIR/"
  rm -rf squashfs-root
  echo "Extraído en: $EXTRACT_DIR"
fi

exec "$EXTRACT_DIR/oprobots-telemetry-studio" "$@"
