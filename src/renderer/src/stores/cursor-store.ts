import { create } from 'zustand';
import type { ZoomRange } from '@widgets/zoom-range';

interface CursorState {
  /**
   * Timestamp (ms) bajo el cursor de una gráfica/timeline. `null` cuando no hay
   * hover; el consumidor debe caer entonces al timestamp del vídeo o al último
   * frame.
   */
  hoverTimestamp_ms: number | null;

  /** Rango seleccionado (zoom) compartido entre timelines; `null` = sin zoom. */
  zoomRange: ZoomRange | null;

  /** Publica el timestamp bajo el cursor. `null` limpia el hover. */
  setHoverTimestamp: (timestamp_ms: number | null) => void;

  /** Publica el rango de zoom. `null` restablece la vista completa. */
  setZoomRange: (range: ZoomRange | null) => void;

  /** Limpia el hover (mouseleave, cambio de dataset, desmontaje). */
  clear: () => void;

  /** Limpia el zoom. */
  clearZoom: () => void;
}

/**
 * Estado temporal compartido entre widgets: hover (cursor) y zoom (rango).
 * Cada widget resuelve el timestamp efectivo aplicando `hover ?? vídeo ?? último
 * frame`, y aplica el `zoomRange` si está definido.
 */
export const useCursorStore = create<CursorState>((set) => ({
  hoverTimestamp_ms: null,
  zoomRange: null,
  setHoverTimestamp: (hoverTimestamp_ms) => set({ hoverTimestamp_ms }),
  setZoomRange: (zoomRange) => set({ zoomRange }),
  clear: () => set({ hoverTimestamp_ms: null }),
  clearZoom: () => set({ zoomRange: null }),
}));
