# Sistema de Widgets

> **Colocación (rejilla fluida)**: los widgets se colocan en una rejilla de 12
> columnas con flujo tipo Bootstrap (no *masonry*). Cada widget tiene `width`
> (columnas: 12/9/8/6/4/3) y `height` (filas de 40px, 2–16). El **orden** es el
> de la lista (no hay x/y).
>
> - **Ancho por defecto**: ancho completo (12). Se redimensiona arrastrando el
>   **asa derecha** (snap a presets: 12/9/8/6/4/3).
> - **Alto**: arrastrando el **asa inferior**, a saltos de fila (40px), con mínimo
>   2 y máximo 16 filas.
> - **Reordenar**: arrastrando la **cabecera** del widget (salvo ⚙/✕); los widgets
>   se refluyen automáticamente.
> - El diálogo de configuración ofrece un **respaldo compacto** (presets de ancho
>   y stepper de alto).
>
> **Sección de UI**: la card que contiene los widgets se muestra como
> **"Telemetría"** y el botón para añadirlos es **"+ Añadir gráfica"**. El panel de
> **Vídeo** aparece solo cuando hay un vídeo cargado; sin vídeo, la zona de
> telemetría ocupa toda la ventana (modo sin vídeo, válido para telemetría
> capturada sin grabación de vídeo).
>
> **Estado de implementación**: los widgets están implementados como componentes
> React (no clases) que reciben `frame`/`context` por props desde `WidgetHost`.
> Cada widget exporta una `WidgetDefinition` (`{ metadata, component }`) y se
> registra en `src/widgets/widget-registry.ts` vía `register-widgets.ts`.
> `WidgetHost` se suscribe al evento `sync:frame` del EventBus y pasa el frame
> sincronizado a todos los widgets del layout, junto con `viewTimestamp_ms`
> (timestamp efectivo del cursor compartido) y `onCursorHover` (publicación del
> hover). Los 4 widgets son: `TimeSeriesChart` (uPlot multi-serie con LTTB),
> `DigitalBitmask`, `Minimap2D` y `StateTimeline`.

## Visión General

Los widgets son componentes visuales que se renderizan en canvas y se redibujan automáticamente con cada frame de telemetría sincronizado. Cada widget declara qué campos de datos necesita y se suscribe al EventBus.

## Cursor Temporal Compartido

Los cuatro widgets comparten un cursor temporal a través de un store Zustand
(`src/renderer/src/stores/cursor-store.ts`, `useCursorStore`):

- La **gráfica temporal** publica el timestamp bajo el ratón al hacer hover,
  mediante la prop `onCursorHover` (y publica `null` al salir con el ratón).
- `WidgetHost` resuelve el **timestamp efectivo** que entrega a todos los widgets
  como prop `viewTimestamp_ms`, con esta prioridad:
  `hover de la gráfica → context.viewTimestamp_ms (vídeo) → frame.timestamp_ms (streaming) → último frame`.
- `DigitalBitmask`, `StateTimeline` y `Minimap2D` muestran el valor / estado /
  posición **exactos** en ese timestamp. Sin hover y sin vídeo, muestran el
  último frame disponible.

La búsqueda del frame más cercano se hace con búsqueda binaria sobre el dataset
(`src/widgets/frame-lookup.ts`: `frameAt`, `frameIndexAt`, `valueAt`).

## Comportamiento por Defecto

- **TimeSeriesChart**: muestra siempre **todo el dataset (t=0..final)**. El zoom
  por arrastre se conserva entre actualizaciones de datos; **doble clic**
  restablece la vista completa. El cursor vertical sigue la posición actual
  (`autoFollow`). Las series se muestrean con LTTB usando un **único conjunto de
  índices**, de modo que la X y todas las Y quedan alineadas por índice.
- **TimeSeriesChart · trazo**: las líneas se dibujan con `pxAlign: false`
  (anti-aliasing real, sin snap a píxel entero) y, con `smoothing > 0` (por
  defecto), con una **spline cúbica monótona** (`uPlot.paths.spline`): suaviza
  los valores cercanos y **no sobrepasa**, por lo que conserva los picos. El
  checkbox "Suavizar líneas" del diálogo lo controla.
- **Minimap2D**: ajusta la escala automáticamente para encuadrar **todo el
  recorrido**, centrado y con márgenes; el triángulo del robot (con orientación)
  se desplaza por la trayectoria según `viewTimestamp_ms`.
- **DigitalBitmask**: por defecto muestra **todos los bits en una sola fila**
  (arrays de sensores de línea); el auto-layout y el alta desde el menú fijan
  `ledsPerRow` al ancho del campo y `rows = 1`.
- **DigitalBitmask** y **StateTimeline**: se repintan al cambiar de tamaño
  (`ResizeObserver` vía `src/widgets/use-canvas-size.ts`) y escalan su contenido
  proporcionalmente (rejilla de LEDs cuadrada y centrada; barra + etiqueta
  proporcionales al alto), en lugar de estirar el bitmap.

## Ciclo de Vida de un Widget

```
1. WidgetRegistry.create(widgetType)
   ↓
2. widget.initialize(canvas, config)
   ↓
3. eventBus.on('frame:current', widget.render)
   ↓
4. [Repetición: render() se llama en cada frame]
   ↓
5. widget.updateConfig(newConfig)  [cuando el usuario cambia ajustes]
   ↓
6. widget.resize(w, h)            [cuando el usuario redimensiona]
   ↓
7. eventBus.off('frame:current')
   ↓
8. widget.destroy()
```

## Widget 1: TimeSeriesChart (Gráficas Temporales)

Renderiza series de datos continuos (PID, velocidad, sensores analógicos) usando uPlot.

```typescript
// src/widgets/time-series-chart/index.tsx

import React, { useRef, useEffect, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEventBus } from '@renderer/hooks/useEventBus';
import { useVideoSync } from '@renderer/hooks/useVideoSync';
import type { TelemetryFrame, VideoFrameContext } from '@core/types/telemetry';
import { downsampleLTTB, framesToLTTBPoints } from '@core/lttb';

interface TimeSeriesConfig {
  series: string[];       // Campos a mostrar
  colors: string[];       // Colores por serie
  yLabel: string;
  yMin?: number;
  yMax?: number;
  maxPoints: number;      // Puntos visibles en el viewport (para LTTB)
}

const DEFAULT_CONFIG: TimeSeriesConfig = {
  series: [],
  colors: ['#22d3ee', '#4ade80', '#facc15', '#f87171'],
  yLabel: 'Value',
  maxPoints: 500,
};

export const TimeSeriesChartWidget: React.FC<{
  widgetId: string;
  config: TimeSeriesConfig;
  dataFields: string[];
}> = ({ widgetId, config: userConfig, dataFields }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const configRef = useRef<TimeSeriesConfig>({ ...DEFAULT_CONFIG, ...userConfig });

  const subscribe = useEventBus();
  const { getFrameAtIndex, getFrameCount } = useVideoSync();

  // Inicializar uPlot
  useEffect(() => {
    if (!canvasRef.current) return;

    const fields = dataFields.length > 0 ? dataFields : configRef.current.series;
    const series = [
      {}, // x-axis
      ...fields.map((field, i) => ({
        label: field,
        stroke: configRef.current.colors[i % configRef.current.colors.length],
        width: 1.5,
      })),
    ];

    const opts: uPlot.Options = {
      width: canvasRef.current.clientWidth,
      height: canvasRef.current.clientHeight,
      series,
      axes: [
        {},
        {
          label: configRef.current.yLabel,
          min: configRef.current.yMin,
          max: configRef.current.yMax,
        },
      ],
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false }, y: {} },
    };

    uplotRef.current = new uPlot(opts, [[]], canvasRef.current);

    return () => {
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [dataFields]);

  // Renderizar con cada frame
  useEffect(() => {
    const unsub = subscribe('frame:current', (payload) => {
      const { frame, context } = payload;
      if (!uplotRef.current) return;

      const fields = dataFields.length > 0 ? dataFields : configRef.current.series;
      const currentIdx = getFrameIndex(frame.timestamp_ms);

      // Tomar una ventana de datos alrededor del frame actual
      const windowSize = 200; // frames a cada lado
      const startIdx = Math.max(0, currentIdx - windowSize);
      const endIdx = Math.min(getFrameCount() - 1, currentIdx + windowSize);
      const windowFrames = getFramesInRange(startIdx, endIdx);

      // Downsample con LTTB para rendimiento
      const seriesData: number[][] = [[]]; // Primera serie = x (timestamps)
      for (const field of fields) {
        const points = framesToLTTBPoints(windowFrames, field);
        const downsampled = downsampleLTTB(points, configRef.current.maxPoints);
        seriesData.push(downsampled.map(p => p.y));
      }
      // X axis: índices normalizados
      const xData = downsampleLTTB(
        windowFrames.map((f, i) => ({ x: i, y: f.timestamp_ms })),
        configRef.current.maxPoints
      ).map(p => p.y / 1000); // segundos

      uplotRef.current.setData([xData, ...seriesData.slice(1)]);
    });

    return unsub;
  }, [dataFields]);

  // Resize observer
  useEffect(() => {
    if (!canvasRef.current) return;

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      uplotRef.current?.setSize({ width, height });
    });

    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-op-dark-900 rounded"
    />
  );
};
```

## Widget 2: DigitalBitmask (Matriz de Sensores IR)

Renderiza un array de sensores IR como una matriz de LEDs On/Off en Canvas 2D.

```typescript
// src/widgets/digital-bitmask/canvas-renderer.ts

import type { TelemetryFrame, VideoFrameContext } from '@core/types/telemetry';

interface BitmaskConfig {
  /** Número de LEDs por fila */
  ledsPerRow: number;

  /** Número de filas (múltiplo de bits en el bitmask) */
  rows: number;

  /** Tamaño de cada LED en píxeles */
  ledSize: number;

  /** Espaciado entre LEDs */
  ledGap: number;

  /** Color cuando el LED está activado */
  onColor: string;

  /** Color cuando el LED está desactivado */
  offColor: string;

  /** Color de fondo */
  backgroundColor: string;
}

const DEFAULT_BITMASK_CONFIG: BitmaskConfig = {
  ledsPerRow: 8,
  rows: 2,
  ledSize: 30,
  ledGap: 6,
  onColor: '#22d3ee',     // Cyan (OPRobots accent)
  offColor: '#1e293b',    // Slate-700
  backgroundColor: '#0a0e17', // Dark-900
};

export class DigitalBitmaskRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: BitmaskConfig = DEFAULT_BITMASK_CONFIG;

  initialize(canvas: HTMLCanvasElement, config?: Partial<BitmaskConfig>): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...DEFAULT_BITMASK_CONFIG, ...config };
  }

  render(
    frame: TelemetryFrame,
    _context: VideoFrameContext,
    dataField: string
  ): void {
    if (!this.ctx || !this.canvas) return;

    const value = frame.data[dataField];
    if (value == null) return;

    // Convertir a número de bits
    const bitmask = typeof value === 'number'
      ? value
      : Array.isArray(value)
        ? value.reduce((acc, v, i) => acc | (v ? 1 << i : 0), 0)
        : 0;

    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const { ledsPerRow, rows, ledSize, ledGap, onColor, offColor, backgroundColor } = this.config;

    // Limpiar canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Centrar la matriz
    const matrixWidth = ledsPerRow * (ledSize + ledGap) - ledGap;
    const matrixHeight = rows * (ledSize + ledGap) - ledGap;
    const offsetX = (width - matrixWidth) / 2;
    const offsetY = (height - matrixHeight) / 2;

    // Dibujar LEDs
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < ledsPerRow; col++) {
        const bitIndex = row * ledsPerRow + col;
        const isOn = (bitmask >> bitIndex) & 1;

        const x = offsetX + col * (ledSize + ledGap);
        const y = offsetY + row * (ledSize + ledGap);

        // LED con esquinas redondeadas
        ctx.fillStyle = isOn ? onColor : offColor;
        ctx.beginPath();
        ctx.roundRect(x, y, ledSize, ledSize, ledSize * 0.2);
        ctx.fill();

        // Glow effect cuando está encendido
        if (isOn) {
          ctx.shadowColor = onColor;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Etiqueta del bit
        ctx.fillStyle = isOn ? '#000' : '#64748b';
        ctx.font = `${Math.min(10, ledSize * 0.3)}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(bitIndex), x + ledSize / 2, y + ledSize / 2);
      }
    }

    // Label del bitmask value en hexadecimal
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `0x${bitmask.toString(16).toUpperCase().padStart(4, '0')} (${bitmask})`,
      width / 2,
      height - 8
    );
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}
```

## Widget 3: Minimap2D (Trayectoria X,Y,Theta)

Renderiza una vista superior de la trayectoria del robot con posición y orientación.

```typescript
// src/widgets/minimap-2d/canvas-renderer.ts

import type { TelemetryFrame, VideoFrameContext } from '@core/types/telemetry';

interface MinimapConfig {
  /** Campo X de posición */
  fieldX: string;

  /** Campo Y de posición */
  fieldY: string;

  /** Campo de orientación (grados) */
  fieldTheta: string;

  /** Escala: píxeles por unidad de posición */
  scale: number;

  /** Color de la trayectoria */
  trailColor: string;

  /** Color del robot actual */
  robotColor: string;

  /** Longitud del cuerpo del robot */
  robotLength: number;

  /** Ancho del cuerpo del robot */
  robotWidth: number;

  /** Mostrar grid de fondo */
  showGrid: boolean;

  /** Espaciado del grid */
  gridSize: number;
}

const DEFAULT_MINIMAP_CONFIG: MinimapConfig = {
  fieldX: 'position_x',
  fieldY: 'position_y',
  fieldTheta: 'heading_deg',
  scale: 50,
  trailColor: '#22d3ee',
  robotColor: '#facc15',
  robotLength: 20,
  robotWidth: 12,
  showGrid: true,
  gridSize: 10,
};

export class Minimap2DRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: MinimapConfig = DEFAULT_MINIMAP_CONFIG;
  private trailHistory: Array<{ x: number; y: number }> = [];
  private maxTrailLength = 500;

  initialize(canvas: HTMLCanvasElement, config?: Partial<MinimapConfig>): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...DEFAULT_MINIMAP_CONFIG, ...config };
  }

  render(
    frame: TelemetryFrame,
    _context: VideoFrameContext,
    _dataFields: string[]
  ): void {
    if (!this.ctx || !this.canvas) return;

    const x = frame.data[this.config.fieldX] as number;
    const y = frame.data[this.config.fieldY] as number;
    const theta = frame.data[this.config.fieldTheta] as number;

    if (x == null || y == null || theta == null) return;

    // Añadir al historial de trayectoria
    this.trailHistory.push({ x, y });
    if (this.trailHistory.length > this.maxTrailLength) {
      this.trailHistory.shift();
    }

    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const { scale, trailColor, robotColor, robotLength, robotWidth, showGrid, gridSize } = this.config;

    // Limpiar
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    // Centro del canvas
    const cx = width / 2;
    const cy = height / 2;

    // Grid
    if (showGrid) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      for (let gx = -200; gx <= 200; gx += gridSize) {
        const px = cx + gx * scale;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      for (let gy = -200; gy <= 200; gy += gridSize) {
        const py = cy + gy * scale;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }
    }

    // Dibujar trayectoria
    if (this.trailHistory.length > 1) {
      ctx.strokeStyle = trailColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();

      const first = this.trailHistory[0]!;
      ctx.moveTo(cx + first.x * scale, cy - first.y * scale);

      for (let i = 1; i < this.trailHistory.length; i++) {
        const p = this.trailHistory[i]!;
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Dibujar robot (triángulo rotado)
    const robotPx = cx + x * scale;
    const robotPy = cy - y * scale;
    const angleRad = (-theta * Math.PI) / 180; // Negativo porque Y está invertido

    ctx.save();
    ctx.translate(robotPx, robotPy);
    ctx.rotate(angleRad);

    // Cuerpo del robot (rectángulo)
    ctx.fillStyle = robotColor;
    ctx.beginPath();
    ctx.moveTo(robotLength / 2, 0);                    // Punta
    ctx.lineTo(-robotLength / 2, -robotWidth / 2);    // Esquina sup-izq
    ctx.lineTo(-robotLength / 2, robotWidth / 2);     // Esquina inf-izq
    ctx.closePath();
    ctx.fill();

    // Glow
    ctx.shadowColor = robotColor;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // Coordenadas actuales
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`X: ${x.toFixed(2)}m  Y: ${y.toFixed(2)}m  θ: ${theta.toFixed(1)}°`, 8, 8);
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.trailHistory = [];
  }
}
```

## Widget 4: StateTimeline (Máquina de Estados)

Renderiza una barra horizontal que muestra el estado actual del robot a lo largo del tiempo.

```typescript
// src/widgets/state-timeline/canvas-renderer.ts

import type { TelemetryFrame, VideoFrameContext } from '@core/types/telemetry';

interface StateTimelineConfig {
  /** Campo que contiene el estado */
  stateField: string;

  /** Mapa de valores de estado a etiquetas y colores */
  stateMap: Record<number, { label: string; color: string }>;

  /** Altura de la barra de estado */
  barHeight: number;

  /** Si mostrar etiquetas de texto sobre la barra */
  showLabels: boolean;
}

const DEFAULT_STATE_CONFIG: StateTimelineConfig = {
  stateField: 'state',
  stateMap: {
    0: { label: 'IDLE', color: '#64748b' },
    1: { label: 'FOLLOWING', color: '#22c55e' },
    2: { label: 'TURNING', color: '#eab308' },
    3: { label: 'SEARCHING', color: '#06b6d4' },
    4: { label: 'LOST', color: '#ef4444' },
    5: { label: 'FINISHED', color: '#8b5cf6' },
  },
  barHeight: 30,
  showLabels: true,
};

export class StateTimelineRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: StateTimelineConfig = DEFAULT_STATE_CONFIG;
  private stateHistory: Array<{ timestamp_ms: number; state: number }> = [];
  private currentState: number = 0;

  initialize(canvas: HTMLCanvasElement, config?: Partial<StateTimelineConfig>): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...DEFAULT_STATE_CONFIG, ...config };
  }

  render(
    frame: TelemetryFrame,
    context: VideoFrameContext,
    _dataFields: string[]
  ): void {
    if (!this.ctx || !this.canvas) return;

    const state = frame.data[this.config.stateField] as number;
    if (state == null) return;

    this.currentState = state;
    this.stateHistory.push({ timestamp_ms: frame.timestamp_ms, state });

    // Mantener solo los últimos N estados para el timeline
    if (this.stateHistory.length > 1000) {
      this.stateHistory = this.stateHistory.slice(-500);
    }

    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const { barHeight, showLabels, stateMap } = this.config;

    // Limpiar
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    // === Parte superior: Estado actual (grande) ===
    const stateInfo = stateMap[state] ?? { label: `State ${state}`, color: '#64748b' };
    ctx.fillStyle = stateInfo.color;
    ctx.font = `bold ${Math.min(20, height * 0.3)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stateInfo.label, width / 2, height * 0.25);

    // Glow del estado actual
    ctx.shadowColor = stateInfo.color;
    ctx.shadowBlur = 20;
    ctx.fillText(stateInfo.label, width / 2, height * 0.25);
    ctx.shadowBlur = 0;

    // === Parte inferior: Timeline ===
    const timelineY = height * 0.55;
    const timelineHeight = Math.min(barHeight, height * 0.25);
    const timelineWidth = width - 20;
    const offsetX = 10;

    if (this.stateHistory.length > 0) {
      const startTime = this.stateHistory[0]!.timestamp_ms;
      const endTime = this.stateHistory[this.stateHistory.length - 1]!.timestamp_ms;
      const totalDuration = Math.max(endTime - startTime, 1);

      // Dibujar barras de estado
      for (let i = 0; i < this.stateHistory.length; i++) {
        const entry = this.stateHistory[i]!;
        const nextEntry = this.stateHistory[i + 1];

        const x1 = offsetX + ((entry.timestamp_ms - startTime) / totalDuration) * timelineWidth;
        const x2 = nextEntry
          ? offsetX + ((nextEntry.timestamp_ms - startTime) / totalDuration) * timelineWidth
          : offsetX + timelineWidth;

        const info = stateMap[entry.state] ?? { label: '', color: '#64748b' };
        ctx.fillStyle = info.color;
        ctx.fillRect(x1, timelineY, Math.max(x2 - x1, 1), timelineHeight);
      }

      // Línea de posición actual
      const currentTimeMs = context.viewTimestamp_ms;
      const currentX = offsetX + ((currentTimeMs - startTime) / totalDuration) * timelineWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentX, timelineY - 4);
      ctx.lineTo(currentX, timelineY + timelineHeight + 4);
      ctx.stroke();

      // Etiquetas de estado
      if (showLabels) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let lastLabel = '';
        for (let i = 0; i < this.stateHistory.length; i++) {
          const entry = this.stateHistory[i]!;
          const info = stateMap[entry.state];
          const label = info?.label ?? '';

          if (label !== lastLabel) {
            const x = offsetX + ((entry.timestamp_ms - startTime) / totalDuration) * timelineWidth;
            ctx.fillText(label, x, timelineY + timelineHeight + 4);
            lastLabel = label;
          }
        }
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.stateHistory = [];
  }
}
```
