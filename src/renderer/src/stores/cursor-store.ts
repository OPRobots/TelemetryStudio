import { create } from 'zustand';

interface CursorState {
  /**
   * Timestamp (ms) bajo el cursor de una gráfica. `null` cuando no hay hover;
   * el consumidor debe caer entonces al timestamp del vídeo o al último frame.
   */
  hoverTimestamp_ms: number | null;

  /** Publica el timestamp bajo el cursor. `null` limpia el hover. */
  setHoverTimestamp: (timestamp_ms: number | null) => void;

  /** Limpia el hover (mouseleave, cambio de dataset, desmontaje). */
  clear: () => void;
}

/**
 * Cursor temporal compartido entre widgets. Solo registra el hover de la
 * gráfica temporal; cada widget resuelve el timestamp efectivo aplicando
 * `hover ?? vídeo ?? último frame`.
 */
export const useCursorStore = create<CursorState>((set) => ({
  hoverTimestamp_ms: null,
  setHoverTimestamp: (hoverTimestamp_ms) => set({ hoverTimestamp_ms }),
  clear: () => set({ hoverTimestamp_ms: null }),
}));
