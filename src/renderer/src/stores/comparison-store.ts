import { create } from 'zustand';

interface ComparisonState {
  /** Modo comparación activo. */
  active: boolean;
  /** Nombre de la sesión de referencia (panel B). */
  referenceName: string | null;
  /** Ruta/URL del vídeo de referencia. */
  referenceVideoSrc: string | null;
  /** Barra de tiempo compartida entre paneles. */
  sharedBar: boolean;
  /** Diferencias de compatibilidad de widgets (si hubo error). */
  differences: string[];
  /** Mensaje de error a mostrar. */
  errorMessage: string | null;

  start: (name: string, videoSrc: string | null) => void;
  stop: () => void;
  setSharedBar: (shared: boolean) => void;
  setDifferences: (differences: string[]) => void;
  setError: (message: string | null) => void;
}

export const useComparisonStore = create<ComparisonState>((set) => ({
  active: false,
  referenceName: null,
  referenceVideoSrc: null,
  sharedBar: true,
  differences: [],
  errorMessage: null,

  start: (name, videoSrc) =>
    set({
      active: true,
      referenceName: name,
      referenceVideoSrc: videoSrc,
      differences: [],
      errorMessage: null,
    }),

  stop: () =>
    set({
      active: false,
      referenceName: null,
      referenceVideoSrc: null,
      differences: [],
      errorMessage: null,
    }),

  setSharedBar: (shared) => set({ sharedBar: shared }),
  setDifferences: (differences) => set({ differences }),
  setError: (message) => set({ errorMessage: message }),
}));
