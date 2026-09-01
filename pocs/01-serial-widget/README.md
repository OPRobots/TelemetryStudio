# PoC 1: Serial → Widget

## Objetivo
Validar el pipeline completo: Serial UART → parse → EventBus → uPlot widget, manteniendo 60 FPS.

## Criterios de Éxito
- [ ] Se puede abrir un puerto serial
- [ ] Los datos se parsean en `TelemetryFrame[]` correctamente
- [ ] El EventBus emite eventos sin lag visible
- [ ] uPlot renderiza la gráfica en vivo a 60 FPS
- [ ] No hay memory leaks tras 5 minutos de uso

## Ejecución
```bash
cd pocs/01-serial-widget
npm install
npm start
```

## Requisitos
- Arduino o dispositivo emulando serial (ver `examples/telemetry.ino`)
- Puerto serial disponible

## Archivos
- `main/index.ts` — Proceso principal con serialport
- `preload/index.ts` — Puente seguro
- `renderer/index.html` — UI con uPlot
- `examples/telemetry.ino` — Sketch Arduino para generar datos
