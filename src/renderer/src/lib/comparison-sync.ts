import { VideoSynchronizer } from '@core/video-synchronizer';

/**
 * Sincronizador del panel de comparación (sesión B).
 * Emite `comparison:frame` y lee del dataset de comparación.
 */
export const comparisonSynchronizer = new VideoSynchronizer({
  frameEvent: 'comparison:frame',
  dataset: 'comparison',
});
