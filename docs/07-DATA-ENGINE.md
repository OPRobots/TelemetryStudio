# Motor de Datos (Data Engine)

## EventBus — Sistema de Publicación/Suscripción

El EventBus es el canal de comunicación central entre el motor de datos y los widgets. Es genérico y tipado: cada evento tiene un payload conocido.

```typescript
// src/core/event-bus.ts

type EventCallback<T> = (payload: T) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  /**
   * Suscribe a un evento. Devuelve una función de cleanup.
   *
   * @param event - Nombre del evento (del EventMap)
   * @param callback - Función a ejecutar cuando se emita el evento
   * @returns Función para desuscribirse
   */
  on<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Retornar función de cleanup
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emite un evento con su payload.
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(payload);
        } catch (error) {
          console.error(`Error in EventBus listener for "${event}":`, error);
        }
      }
    }
  }

  /**
   * Suscribe a un evento una sola vez.
   */
  once<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    const wrapper: EventCallback<EventMap[K]> = (payload) => {
      unsub();
      callback(payload);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }

  /**
   * Elimina todos los listeners de un evento.
   */
  off(event: keyof EventMap): void {
    this.listeners.delete(event);
  }

  /**
   * Elimina todos los listeners de todos los eventos.
   */
  clear(): void {
    this.listeners.clear();
  }
}

// Singleton global
export const eventBus = new EventBus();
```

## TelemetryStore — Almacén de Frames (Multi-Dataset)

```typescript
// src/core/telemetry-store.ts

import { eventBus } from './event-bus';
import { binarySearch } from './binary-search';

class TelemetryStore {
  /** Dataset primario (sesión activa) */
  private primaryFrames: TelemetryFrame[] = [];
  private primaryDataset: TelemetryDataset | null = null;
  private primarySorted: boolean = true;

  /** Dataset de comparación (sesión B en side-by-side) */
  private comparisonFrames: TelemetryFrame[] = [];
  private comparisonDataset: TelemetryDataset | null = null;
  private comparisonSorted: boolean = true;

  // === Dataset Primario ===

  /**
   * Carga el dataset primario (sesión principal).
   */
  loadDataset(dataset: TelemetryDataset): void {
    this.primaryDataset = dataset;
    this.primaryFrames = dataset.frames;
    this.primarySorted = true;

    eventBus.emit('data:loaded', { dataset });
  }

  /**
   * Añade un frame al dataset primario en streaming (modo serial).
   */
  addFrame(frame: TelemetryFrame): void {
    this.primaryFrames.push(frame);

    if (this.primaryFrames.length > 1) {
      const last = this.primaryFrames[this.primaryFrames.length - 2];
      if (last && frame.timestamp_ms < last.timestamp_ms) {
        this.primarySorted = false;
      }
    }
  }

  /**
   * Busca el frame más cercano a un timestamp en el dataset primario.
   * Complejidad: O(log N)
   */
  findClosestFrame(timestamp_ms: number): TelemetryFrame | null {
    if (this.primaryFrames.length === 0) return null;

    if (!this.primarySorted) {
      this.primaryFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.primarySorted = true;
    }

    return binarySearch(this.primaryFrames, timestamp_ms);
  }

  /**
   * Busca frames en un rango de timestamps (dataset primario).
   */
  findFramesInRange(start_ms: number, end_ms: number): TelemetryFrame[] {
    if (!this.primarySorted) {
      this.primaryFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.primarySorted = true;
    }

    const startIdx = this.lowerBound(this.primaryFrames, start_ms);
    const endIdx = this.upperBound(this.primaryFrames, end_ms);
    return this.primaryFrames.slice(startIdx, endIdx);
  }

  getFrameAt(index: number): TelemetryFrame | null {
    return this.primaryFrames[index] ?? null;
  }

  get frameCount(): number {
    return this.primaryFrames.length;
  }

  get currentDataset(): TelemetryDataset | null {
    return this.primaryDataset;
  }

  getAllFrames(): TelemetryFrame[] {
    return this.primaryFrames;
  }

  // === Dataset de Comparación ===

  /**
   * Carga un dataset de comparación (sesión B en side-by-side).
   * Solo puede haber 1 dataset de comparación activo.
   */
  loadComparisonDataset(dataset: TelemetryDataset): void {
    this.comparisonDataset = dataset;
    this.comparisonFrames = dataset.frames;
    this.comparisonSorted = true;

    eventBus.emit('data:loaded', { dataset });
  }

  /**
   * Busca el frame más cercano en el dataset de comparación.
   */
  findClosestFrameComparison(timestamp_ms: number): TelemetryFrame | null {
    if (this.comparisonFrames.length === 0) return null;

    if (!this.comparisonSorted) {
      this.comparisonFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.comparisonSorted = true;
    }

    return binarySearch(this.comparisonFrames, timestamp_ms);
  }

  /**
   * Obtiene el dataset de comparación.
   */
  get comparisonData(): TelemetryDataset | null {
    return this.comparisonDataset;
  }

  /**
   * Obtiene los frames del dataset de comparación.
   */
  getComparisonFrames(): TelemetryFrame[] {
    return this.comparisonFrames;
  }

  /**
   * Limpia solo el dataset de comparación.
   */
  clearComparison(): void {
    this.comparisonFrames = [];
    this.comparisonDataset = null;
    eventBus.emit('comparison:stop', {});
  }

  // === Limpieza General ===

  /**
   * Limpia todos los datasets (primario + comparación).
   */
  clear(): void {
    this.primaryFrames = [];
    this.primaryDataset = null;
    this.comparisonFrames = [];
    this.comparisonDataset = null;
  }

  // === Helpers Internos ===

  private lowerBound(frames: TelemetryFrame[], target_ms: number): number {
    let low = 0;
    let high = frames.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timestamp_ms < target_ms) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  private upperBound(frames: TelemetryFrame[], target_ms: number): number {
    let low = 0;
    let high = frames.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timestamp_ms <= target_ms) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
}

export const telemetryStore = new TelemetryStore();
```

## ComparisonManager — Gestor de Comparación Side-by-Side

```typescript
// src/core/comparison-manager.ts

import { eventBus } from './event-bus';
import { telemetryStore } from './telemetry-store';
import type { SessionFile, SessionWidget } from '@core/types/session';
import type { TelemetryDataset } from '@core/types/telemetry';
import { sessionToDataset } from '@core/session-codec';

/**
 * Resultado de la validación de compatibilidad de widgets.
 */
interface WidgetCompatibilityResult {
  compatible: boolean;
  differences: string[];
}

class ComparisonManager {
  private active: boolean = false;
  private referenceSession: SessionFile | null = null;
  private sharedVerticalBar: boolean = true;

  /**
   * Activa el modo comparación con una sesión de referencia.
   * Valida que los widgets sean idénticos antes de activar.
   *
   * @param reference - Sesión A (referencia)
   * @param currentWidgets - Widgets de la sesión B (actual)
   * @returns Resultado de compatibilidad
   */
  startComparison(
    reference: SessionFile,
    currentWidgets: SessionWidget[]
  ): WidgetCompatibilityResult {
    // Validar compatibilidad de widgets
    const result = this.validateWidgetCompatibility(
      reference.layout.widgets,
      currentWidgets
    );

    if (!result.compatible) {
      eventBus.emit('comparison:widget-mismatch', {
        differences: result.differences,
      });
      return result;
    }

    // Cargar dataset de comparación en TelemetryStore
    const referenceDataset = sessionToDataset(reference);
    telemetryStore.loadComparisonDataset(referenceDataset);

    this.referenceSession = reference;
    this.active = true;

    eventBus.emit('comparison:start', {
      referenceSession: reference,
      referenceDataset,
    });

    return result;
  }

  /**
   * Detiene el modo comparación.
   */
  stopComparison(): void {
    telemetryStore.clearComparison();
    this.referenceSession = null;
    this.active = false;

    eventBus.emit('comparison:stop', {});
  }

  /**
   * Cambia el modo de sincronización de la barra vertical.
   *
   * @param shared - true = barra compartida, false = barras independientes
   */
  setSyncBarMode(shared: boolean): void {
    this.sharedVerticalBar = shared;
    eventBus.emit('comparison:sync-mode-change', { sharedBar: shared });
  }

  /**
   * Valida que los widgets de dos sesiones sean idénticos.
   * Compara: tipo, campos, posición, tamaño, configuración.
   */
  private validateWidgetCompatibility(
    widgetsA: SessionWidget[],
    widgetsB: SessionWidget[]
  ): WidgetCompatibilityResult {
    const differences: string[] = [];

    if (widgetsA.length !== widgetsB.length) {
      differences.push(
        `Número de widgets diferente: sesión A tiene ${widgetsA.length}, sesión B tiene ${widgetsB.length}`
      );
    }

    const maxLen = Math.max(widgetsA.length, widgetsB.length);
    for (let i = 0; i < maxLen; i++) {
      const wA = widgetsA[i];
      const wB = widgetsB[i];

      if (!wA || !wB) {
        differences.push(`Widget #${i + 1}: existe en una sesión pero no en la otra`);
        continue;
      }

      if (wA.t !== wB.t) {
        differences.push(
          `Widget #${i + 1}: tipo diferente ("${wA.t}" vs "${wB.t}")`
        );
      }

      if (JSON.stringify(wA.fields) !== JSON.stringify(wB.fields)) {
        differences.push(
          `Widget #${i + 1}: campos diferentes (${wA.fields.join(', ')} vs ${wB.fields.join(', ')})`
        );
      }

      if (JSON.stringify(wA.pos) !== JSON.stringify(wB.pos)) {
        differences.push(
          `Widget #${i + 1}: posición diferente ([${wA.pos}] vs [${wB.pos}])`
        );
      }

      if (JSON.stringify(wA.size) !== JSON.stringify(wB.size)) {
        differences.push(
          `Widget #${i + 1}: tamaño diferente ([${wA.size}] vs [${wB.size}])`
        );
      }

      if (JSON.stringify(wA.config) !== JSON.stringify(wB.config)) {
        differences.push(
          `Widget #${i + 1}: configuración diferente`
        );
      }
    }

    return {
      compatible: differences.length === 0,
      differences,
    };
  }

  get isActive(): boolean {
    return this.active;
  }

  get isSharedBar(): boolean {
    return this.sharedVerticalBar;
  }

  get currentReference(): SessionFile | null {
    return this.referenceSession;
  }
}

export const comparisonManager = new ComparisonManager();
```

## Búsqueda Binaria

```typescript
// src/core/binary-search.ts

/**
 * Búsqueda binaria O(log N) para encontrar el frame más cercano
 * a un timestamp dado en un array ordenado.
 *
 * @param frames - Array de TelemetryFrames ordenados por timestamp_ms
 * @param target_ms - Timestamp objetivo en milisegundos
 * @returns El frame con timestamp más cercano al objetivo
 */
export function binarySearch(
  frames: TelemetryFrame[],
  target_ms: number
): TelemetryFrame {
  if (frames.length === 0) {
    return { timestamp_ms: 0, data: {} };
  }

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midTime = frames[mid].timestamp_ms;

    if (midTime < target_ms) {
      low = mid + 1;
    } else if (midTime > target_ms) {
      high = mid - 1;
    } else {
      return frames[mid]; // Match exacto
    }
  }

  // low = primer índice con timestamp >= target
  if (low >= frames.length) return frames[frames.length - 1];
  if (high < 0) return frames[0];

  // Comparar distancias para elegir el más cercano
  const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
  const diffHigh = Math.abs(frames[high].timestamp_ms - target_ms);

  return diffLow <= diffHigh ? frames[low] : frames[high];
}

/**
 * Búsqueda binaria que devuelve el índice del frame más cercano.
 */
export function binarySearchIndex(
  frames: TelemetryFrame[],
  target_ms: number
): number {
  if (frames.length === 0) return 0;

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].timestamp_ms < target_ms) {
      low = mid + 1;
    } else if (frames[mid].timestamp_ms > target_ms) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  if (low >= frames.length) return frames.length - 1;
  if (high < 0) return 0;

  const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
  const diffHigh = Math.abs(frames[high].timestamp_ms - target_ms);

  return diffLow <= diffHigh ? low : high;
}
```

## Downsampling LTTB

```typescript
// src/core/lttb.ts

/**
 * Largest-Triangle-Three-Buckets downsampling.
 * Reduce N puntos a K puntos preservando la forma visual de la serie temporal.
 *
 * Complejidad: O(n) — un solo pass lineal.
 *
 * @param data - Array de puntos [{x, y}] ordenados por x
 * @param targetPoints - Número de puntos deseados (K)
 * @returns Array reducido de K puntos
 */
export interface LTTBPoint {
  x: number;
  y: number;
}

export function downsampleLTTB(
  data: LTTBPoint[],
  targetPoints: number
): LTTBPoint[] {
  // Edge cases
  if (data.length <= 2 || targetPoints >= data.length) {
    return data.slice();
  }
  if (targetPoints <= 2) {
    return [data[0]!, data[data.length - 1]!];
  }

  const sampled: LTTBPoint[] = [];
  const bucketSize = (data.length - 2) / (targetPoints - 2);

  // Siempre incluir el primer punto
  sampled.push(data[0]!);

  let prevSelectedIndex = 0;

  for (let i = 0; i < targetPoints - 2; i++) {
    // Rango del bucket actual (índices 1..N-2)
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((i + 1) * bucketSize) + 1,
      data.length - 1
    );

    // Rango del siguiente bucket (para calcular el punto promedio)
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      data.length - 1
    );

    // Calcular promedio del siguiente bucket
    let avgX = 0;
    let avgY = 0;
    let count = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const p = data[j];
      if (p) {
        avgX += p.x;
        avgY += p.y;
        count++;
      }
    }
    if (count > 0) {
      avgX /= count;
      avgY /= count;
    } else {
      const last = data[data.length - 1]!;
      avgX = last.x;
      avgY = last.y;
    }

    const avgPoint: LTTBPoint = { x: avgX, y: avgY };
    const prevPoint = data[prevSelectedIndex]!;

    // Encontrar el punto con mayor área de triángulo en el bucket actual
    let maxArea = -1;
    let maxAreaIndex = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const p = data[j];
      if (!p) continue;
      const area = triangleArea(prevPoint, p, avgPoint);
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(data[maxAreaIndex]!);
    prevSelectedIndex = maxAreaIndex;
  }

  // Siempre incluir el último punto
  sampled.push(data[data.length - 1]!);

  return sampled;
}

/**
 * Calcula el área de un triángulo formado por 3 puntos.
 */
function triangleArea(p1: LTTBPoint, p2: LTTBPoint, p3: LTTBPoint): number {
  return Math.abs(
    (p1.x - p3.x) * (p2.y - p1.y) -
    (p1.x - p2.x) * (p3.y - p1.y)
  ) / 2;
}

/**
 * Helper: convierte TelemetryFrame[] a LTTBPoint[] para un campo dado.
 */
export function framesToLTTBPoints(
  frames: TelemetryFrame[],
  fieldName: string
): LTTBPoint[] {
  return frames
    .filter(f => f.data[fieldName] != null)
    .map(f => ({
      x: f.timestamp_ms,
      y: f.data[fieldName] as number,
    }));
}
```

## Servicio de Sesiones (Session Manager)

> **Estado**: la lógica actual vive en `src/renderer/src/lib/session-actions.ts`
> (usa `session-codec` + los handlers IPC `session:*`). El servicio formal
> `src/services/session-manager.ts` que se muestra a continuación está
> **planificado para la Fase 4** del roadmap; el pseudo-código refleja la API
> objetivo.

```typescript
// src/services/session-manager.ts

import { ipcRenderer } from 'electron';
import type { SessionFile } from '@core/types/session';
import { encodeSession, decodeSession, sessionToDataset, datasetToSession } from '@core/session-codec';
import { telemetryStore } from '@core/telemetry-store';
import { layoutManager } from './layout-manager';

class SessionManager {
  async exportSession(
    sessionName: string,
    videoPath: string,
    sync: { offset_ms: number; anchor: [number, number] | null; rate: number },
    outputDir: string
  ): Promise<string> {
    const dataset = telemetryStore.currentDataset;
    if (!dataset) throw new Error('No telemetry data loaded');

    const layout = layoutManager.getCurrentLayout();
    if (!layout) throw new Error('No layout loaded');

    const videoInfo = await ipcRenderer.invoke('video:getInfo', videoPath);
    const session = datasetToSession(dataset, { file: videoInfo.filename, ...videoInfo }, sync, {
      widgets: layout.widgets.map(w => ({
        type: w.type,
        pos: [w.x, w.y],
        size: [w.width, w.height],
        fields: w.dataFields,
        config: w.config,
      })),
    });

    return ipcRenderer.invoke('session:export', sessionName, outputDir, encodeSession(session), videoPath);
  }

  async importSession(jsonPath: string): Promise<void> {
    const jsonContent = await ipcRenderer.invoke('session:read', jsonPath);
    const session = decodeSession(jsonContent);

    const videoPath = await ipcRenderer.invoke('session:getVideoPath', jsonPath, session.video.file);
    await ipcRenderer.invoke('video:load', videoPath);

    const dataset = sessionToDataset(session);
    telemetryStore.loadDataset(dataset);

    await ipcRenderer.invoke('sync:setOffset', session.sync.offset_ms);
    if (session.sync.anchor) {
      await ipcRenderer.invoke('sync:setAnchor', session.sync.anchor[0], session.sync.anchor[1]);
    }
    await ipcRenderer.invoke('sync:setRate', session.sync.rate);

    layoutManager.loadLayout({
      version: 1,
      name: session.name,
      createdAt: session.created,
      modifiedAt: session.created,
      videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: true, overlays: [] },
      widgets: session.layout.widgets.map((w, i) => ({
        id: `widget-${i}`,
        type: w.t,
        label: w.t,
        x: w.pos[0],
        y: w.pos[1],
        width: w.size[0],
        height: w.size[1],
        dataFields: w.fields,
        config: w.config ?? {},
        visible: true,
        zIndex: i,
      })),
      global: { theme: 'dark', units: { speed: 'rpm', distance: 'm', angle: 'deg' }, showGrid: true, snapToGrid: true, gridSize: 40 },
    });
  }
}

export const sessionManager = new SessionManager();
```

## Main Process — Handlers de Sesión

```typescript
// src/main/ipc-handlers.ts (añadido)

import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';

ipcMain.handle('session:export', async (_event, name: string, outputDir: string, jsonContent: string, videoPath: string) => {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sessionDir = join(outputDir, safeName);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, 'session.json'), jsonContent, 'utf-8');
  await copyFile(videoPath, join(sessionDir, basename(videoPath)));
  return sessionDir;
});

ipcMain.handle('session:read', async (_event, jsonPath: string) => {
  return readFile(jsonPath, 'utf-8');
});

ipcMain.handle('session:getVideoPath', async (_event, jsonPath: string, videoFile: string) => {
  return join(dirname(jsonPath), videoFile);
});
```
