#!/bin/bash
# generate-mock.sh — Genera video MP4 + telemetry JSON para PoC 2
#
# Video: 10s, 30fps, 640x480, fondo azul con número de frame visible
# Telemetry: 300 frames, spike en frame 150 (accX salta a 500)
#
# Uso: bash generate-mock.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Generando mock video (10s, 30fps, 640x480) ==="

ffmpeg -y \
  -f lavfi -i "color=c=0x111827:s=640x480:d=10:r=30" \
  -vf "drawtext=fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:text='%{frame_num}':start_number=1,drawtext=fontsize=24:fontcolor=0x60a5fa:x=20:y=20:text='PoC 2 - Video Sync Test'" \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast \
  "$SCRIPT_DIR/mock_video.mp4"

echo "=== Generando mock telemetry (300 frames, spike en frame 150) ==="

node -e "
const fs = require('fs');
const frames = [];
const NUM_FRAMES = 300;
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
  const battery = 100 - (i * 0.1);

  // SPIKE at frame 150 (t ≈ 5000ms): accX jumps to 500 for 5 frames
  if (i >= 150 && i < 155) {
    accX = 500;
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
  spike: { frame: 150, field: 'accX', value: 500, duration_frames: 5 },
  frames
};

fs.writeFileSync('$SCRIPT_DIR/mock_telemetry.json', JSON.stringify(output, null, 2));
console.log('Generated ' + NUM_FRAMES + ' frames');
console.log('Spike at frame 150 (t=' + (150 * INTERVAL_MS).toFixed(1) + 'ms): accX = 500');
"

echo "=== Listo ==="
echo "  Video:    $SCRIPT_DIR/mock_video.mp4"
echo "  Telemetry: $SCRIPT_DIR/mock_telemetry.json"
