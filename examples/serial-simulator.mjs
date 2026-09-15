#!/usr/bin/env node
/**
 * Simulador de telemetría Serial para OPRobots Telemetry Studio.
 *
 * Genera líneas en el MISMO formato que el firmware STM32 de referencia:
 *   timestamp_ms,accX,accY,accZ,gyroX,gyroY,gyroZ,battery
 *
 * Uso:
 *   node examples/serial-simulator.mjs <puerto-serial> [hz]
 *
 * Ejemplo con puerto virtual (socat):
 *   socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 pty,raw,echo=0,link=/tmp/ttyV1
 *   node examples/serial-simulator.mjs /tmp/ttyV1 50
 *   # En la app: conectar a /tmp/ttyV0 a 115200 baud
 *
 * Sin argumento de puerto imprime por stdout (para depuración).
 */
import { SerialPort } from 'serialport';

const port = process.argv[2];
const hz = Number(process.argv[3] ?? 50);
const intervalMs = Math.max(1, Math.round(1000 / hz));

let t = 0;
let frame = 0;

function makeLine() {
  const s = t / 1000;
  const accX = Math.sin(s * 6.28) * 9.8;
  const accY = Math.cos(s * 6.28) * 9.8;
  const accZ = 9.8 + Math.sin(s * 3.14) * 0.5;
  const gyroX = Math.sin(s * 9.42) * 180;
  const gyroY = Math.cos(s * 9.42) * 180;
  const gyroZ = 0;
  const battery = Math.max(0, 100 - frame * 0.001);
  const line =
    `${t},${accX.toFixed(2)},${accY.toFixed(2)},${accZ.toFixed(2)},` +
    `${gyroX.toFixed(2)},${gyroY.toFixed(2)},${gyroZ.toFixed(2)},${battery.toFixed(2)}`;

  t += intervalMs;
  frame += 1;
  return line;
}

function tick() {
  const line = makeLine();
  if (sp) {
    sp.write(`${line}\r\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

let sp = null;

if (port) {
  sp = new SerialPort({ path: port, baudRate: 115200 });
  sp.on('open', () => {
    console.log(`Simulando ${hz} Hz en ${port} — Ctrl+C para detener`);
    setInterval(tick, intervalMs);
  });
  sp.on('error', (err) => {
    console.error(`Error de puerto: ${err.message}`);
    process.exit(1);
  });
} else {
  console.log(`Simulando ${hz} Hz por stdout — Ctrl+C para detener`);
  setInterval(tick, intervalMs);
}
