import { eventBus } from './event-bus';
import { binarySearch, findFramesInRange as framesInRange } from './binary-search';
import type { TelemetryFrame, TelemetryDataset } from './types/telemetry';

/**
 * Almacén de frames de telemetría.
 * Soporta dataset primario (sesión activa) y de comparación (side-by-side).
 */
export class TelemetryStore {
  private primaryFrames: TelemetryFrame[] = [];
  private primaryDataset: TelemetryDataset | null = null;
  private primarySorted = true;

  private comparisonFrames: TelemetryFrame[] = [];
  private comparisonDataset: TelemetryDataset | null = null;
  private comparisonSorted = true;

  // === Dataset Primario ===

  loadDataset(dataset: TelemetryDataset): void {
    this.primaryDataset = dataset;
    this.primaryFrames = dataset.frames;
    this.primarySorted = true;

    eventBus.emit('data:loaded', { dataset });
  }

  addFrame(frame: TelemetryFrame): void {
    this.primaryFrames.push(frame);

    if (this.primaryFrames.length > 1) {
      const last = this.primaryFrames[this.primaryFrames.length - 2];
      if (last && frame.timestamp_ms < last.timestamp_ms) {
        this.primarySorted = false;
      }
    }
  }

  findClosestFrame(timestamp_ms: number): TelemetryFrame | null {
    if (this.primaryFrames.length === 0) return null;

    if (!this.primarySorted) {
      this.primaryFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.primarySorted = true;
    }

    return binarySearch(this.primaryFrames, timestamp_ms);
  }

  findFramesInRange(start_ms: number, end_ms: number): TelemetryFrame[] {
    if (!this.primarySorted) {
      this.primaryFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.primarySorted = true;
    }

    return framesInRange(this.primaryFrames, start_ms, end_ms);
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

  loadComparisonDataset(dataset: TelemetryDataset): void {
    this.comparisonDataset = dataset;
    this.comparisonFrames = dataset.frames;
    this.comparisonSorted = true;

    eventBus.emit('data:loaded', { dataset });
  }

  findClosestFrameComparison(timestamp_ms: number): TelemetryFrame | null {
    if (this.comparisonFrames.length === 0) return null;

    if (!this.comparisonSorted) {
      this.comparisonFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      this.comparisonSorted = true;
    }

    return binarySearch(this.comparisonFrames, timestamp_ms);
  }

  get comparisonData(): TelemetryDataset | null {
    return this.comparisonDataset;
  }

  getComparisonFrames(): TelemetryFrame[] {
    return this.comparisonFrames;
  }

  clearComparison(): void {
    this.comparisonFrames = [];
    this.comparisonDataset = null;
    eventBus.emit('comparison:stop', {});
  }

  /** Vacía solo el dataset primario (no toca el de comparación). */
  clearPrimary(): void {
    this.primaryFrames = [];
    this.primaryDataset = null;
    this.primarySorted = true;
  }

  clear(): void {
    this.primaryFrames = [];
    this.primaryDataset = null;
    this.comparisonFrames = [];
    this.comparisonDataset = null;
  }
}

/** Singleton global del TelemetryStore */
export const telemetryStore = new TelemetryStore();
