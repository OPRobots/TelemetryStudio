import { create } from 'zustand';

interface ComparisonState {
  /** Modo comparación activo. */
  active: boolean;
  /** Nombre de la sesión de referencia (panel B). */
  referenceName: string | null;
  /** Ruta/URL del vídeo de referencia. */
  referenceVideoSrc: string | null;
  /** FPS del vídeo de referencia (para el paso a paso). */
  referenceFps: number | null;
  /** Diferencias de compatibilidad de widgets (si hubo error). */
  differences: string[];
  /** Mensaje de error a mostrar. */
  errorMessage: string | null;

  start: (name: string, videoSrc: string | null, fps?: number | null) => void;
  stop: () => void;
  setDifferences: (differences: string[]) => void;
  setError: (message: string | null) => void;
}

export const useComparisonStore = create<ComparisonState>((set) => ({
  active: false,
  referenceName: null,
  referenceVideoSrc: null,
  referenceFps: null,
  differences: [],
  errorMessage: null,

  start: (name, videoSrc, fps = null) =>
    set({
      active: true,
      referenceName: name,
      referenceVideoSrc: videoSrc,
      referenceFps: fps,
      differences: [],
      errorMessage: null,
    }),

  stop: () =>
    set({
      active: false,
      referenceName: null,
      referenceVideoSrc: null,
      referenceFps: null,
      differences: [],
      errorMessage: null,
    }),

  setDifferences: (differences) => set({ differences }),
  setError: (message) => set({ errorMessage: message }),
}));
