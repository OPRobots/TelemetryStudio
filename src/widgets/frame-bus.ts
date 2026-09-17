import { createContext, useContext, useEffect, useRef } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';

export interface FrameSnapshot {
  frame: TelemetryFrame | null;
  context: VideoFrameContext | null;
}

type FrameListener = (snapshot: FrameSnapshot) => void;

/**
 * Bus de frames por panel. Evita que el host re-renderice React en cada frame:
 * publica el frame/contexto actual y los widgets se redibujan de forma
 * imperativa suscribiéndose a él.
 *
 * Cada `WidgetHost` tiene su propia instancia (comparación = 2 paneles) y la
 * provee a sus widgets por contexto.
 */
export class FrameBus {
  private snapshot: FrameSnapshot = { frame: null, context: null };
  private listeners = new Set<FrameListener>();

  update(frame: TelemetryFrame | null, context: VideoFrameContext | null): void {
    this.snapshot = { frame, context };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): FrameSnapshot {
    return this.snapshot;
  }
}

export const FrameBusContext = createContext<FrameBus | null>(null);

/** Bus del panel actual (o `null` si el widget se monta fuera de un host). */
export function useFrameBus(): FrameBus | null {
  return useContext(FrameBusContext);
}

/**
 * Suscribe un callback a los frames del panel actual. El callback se mantiene
 * actualizado por ref, así que puede ser inestable sin re-suscribir.
 */
export function useFrameSubscription(listener: () => void): void {
  const bus = useFrameBus();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    if (!bus) return;
    return bus.subscribe(() => listenerRef.current());
  }, [bus]);
}

/**
 * Timestamp efectivo: hover del usuario > posición del vídeo > frame actual >
 * último frame del dataset.
 */
export function resolveViewTimestamp(
  frames: TelemetryFrame[],
  hoverTimestamp_ms: number | null | undefined,
  snapshot: FrameSnapshot
): number | null {
  if (hoverTimestamp_ms != null) return hoverTimestamp_ms;
  if (snapshot.context?.viewTimestamp_ms != null) return snapshot.context.viewTimestamp_ms;
  if (snapshot.frame?.timestamp_ms != null) return snapshot.frame.timestamp_ms;
  return frames.length > 0 ? frames[frames.length - 1]!.timestamp_ms : null;
}
