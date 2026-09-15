#!/bin/bash
# generate-mock.sh — Genera telemetry JSON de 60s para PoC 3
#
# Telemetry: 1800 frames a 30fps (60 segundos)
# Señales con patrones variados para validar exportación
#
# Uso: bash generate-mock.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Generando mock telemetry (1800 frames, 60s) ==="

node -e "
const fs = require('fs');
const frames = [];
const NUM_FRAMES = 1800;
const INTERVAL_MS = 33.333; // ~30fps

for (let i = 0; i < NUM_FRAMES; i++) {
  const t = i * INTERVAL_MS;
  const tSec = t / 1000;

  // Base signals: smooth sin/cos
  let accX = Math.sin(tSec * 2 * Math.PI) * 9.8;
  const accY = Math.cos(tSec * 2 * Math.PI) * 9.8;
  const accZ = 9.8 + Math.sin(tSec * Math.PI) * 0.5;
  const gyroX = Math.sin(tSec * 6 * Math.PI) * 180;
  const gyroY = Math.cos(tSec * 6 * Math.PI) * 180;
  const gyroZ = 0;
  const battery = 100 - (i * 0.03);

  // SPIKE at frame 450 (t = 15000ms): accX jumps to 500 for 10 frames
  if (i >= 450 && i < 460) {
    accX = 500;
  }

  // SPIKE at frame 900 (t = 30000ms): accY jumps to -400 for 8 frames
  if (i >= 900 && i < 908) {
    const accYBase = Math.cos((i * INTERVAL_MS / 1000) * 2 * Math.PI) * 9.8;
    accX = accYBase + 300;
  }

  // SPIKE at frame 1350 (t = 45000ms): both accX and gyroX spike
  if (i >= 1350 && i < 1360) {
    accX = 600;
  }

  frames.push({
    timestamp_ms: Math.round(t * 100) / 100,
    accX: Math.round(accX * 100) / 100,
    accY: Math.round(accY * 100) / 100,
    accZ: Math.round(accZ * 100) / 100,
    gyroX: Math.round(gyroX * 100) / 100,
    gyroY: Math.round(gyroY * 100) / 100,
    gyroZ: Math.round(gyroZ * 100) / 100,
    battery: Math.round(battery * 100) / 100
  });
}

const output = {
  fps: 30,
  duration_ms: NUM_FRAMES * INTERVAL_MS,
  num_frames: NUM_FRAMES,
  fields: ['accX', 'accY', 'accZ', 'gyroX', 'gyroY', 'gyroZ', 'battery'],
  spikes: [
    { frame: 450, field: 'accX', value: 500, duration_frames: 10 },
    { frame: 900, field: 'accX', value: 300, duration_frames: 8 },
    { frame: 1350, field: 'accX', value: 600, duration_frames: 10 }
  ],
  frames
};

fs.writeFileSync('$SCRIPT_DIR/mock_telemetry.json', JSON.stringify(output, null, 2));
console.log('Generated ' + NUM_FRAMES + ' frames (' + (NUM_FRAMES * INTERVAL_MS / 1000).toFixed(1) + 's)');
console.log('Spikes at frames 450, 900, 1350');
"

echo "=== Listo ==="
echo "  Telemetry: $SCRIPT_DIR/mock_telemetry.json"
