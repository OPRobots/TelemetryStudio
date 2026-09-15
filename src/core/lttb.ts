import type { TelemetryFrame } from './types/telemetry';

export interface LTTBPoint {
  x: number;
  y: number;
}

/**
 * Largest-Triangle-Three-Buckets downsampling.
 * Reduce N puntos a K puntos preservando la forma visual de la serie temporal.
 * Complejidad: O(n) — un solo pass lineal.
 */
export function downsampleLTTB(
  data: LTTBPoint[],
  targetPoints: number
): LTTBPoint[] {
  if (data.length <= 2 || targetPoints >= data.length) {
    return data.slice();
  }
  if (targetPoints <= 2) {
    return [data[0]!, data[data.length - 1]!];
  }

  const sampled: LTTBPoint[] = [];
  const bucketSize = (data.length - 2) / (targetPoints - 2);

  sampled.push(data[0]!);

  let prevSelectedIndex = 0;

  for (let i = 0; i < targetPoints - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((i + 1) * bucketSize) + 1,
      data.length - 1
    );

    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      data.length - 1
    );

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

  sampled.push(data[data.length - 1]!);

  return sampled;
}

function triangleArea(p1: LTTBPoint, p2: LTTBPoint, p3: LTTBPoint): number {
  return (
    Math.abs((p1.x - p3.x) * (p2.y - p1.y) - (p1.x - p2.x) * (p3.y - p1.y)) /
    2
  );
}

/**
 * Convierte TelemetryFrame[] a LTTBPoint[] para un campo dado.
 */
export function framesToLTTBPoints(
  frames: TelemetryFrame[],
  fieldName: string
): LTTBPoint[] {
  return frames
    .filter((f) => f.data[fieldName] != null)
    .map((f) => ({
      x: f.timestamp_ms,
      y: f.data[fieldName] as number,
    }));
}
