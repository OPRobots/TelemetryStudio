import { describe, it, expect, beforeEach } from 'vitest';
import { useComparisonStore } from '@renderer/stores/comparison-store';

describe('comparison-store', () => {
  beforeEach(() => {
    useComparisonStore.getState().stop();
  });

  it('starts inactive', () => {
    const state = useComparisonStore.getState();
    expect(state.active).toBe(false);
    expect(state.sharedBar).toBe(true);
  });

  it('activates a comparison', () => {
    useComparisonStore.getState().start('Sesión B', '/videos/b.mp4');
    const state = useComparisonStore.getState();
    expect(state.active).toBe(true);
    expect(state.referenceName).toBe('Sesión B');
    expect(state.referenceVideoSrc).toBe('/videos/b.mp4');
  });

  it('accepts a null video source', () => {
    useComparisonStore.getState().start('Sin vídeo', null);
    expect(useComparisonStore.getState().referenceVideoSrc).toBeNull();
  });

  it('stops and resets', () => {
    useComparisonStore.getState().start('B', '/b.mp4');
    useComparisonStore.getState().setSharedBar(false);
    useComparisonStore.getState().setDifferences(['x']);
    useComparisonStore.getState().stop();

    const state = useComparisonStore.getState();
    expect(state.active).toBe(false);
    expect(state.referenceName).toBeNull();
    expect(state.differences).toEqual([]);
  });

  it('toggles the shared bar', () => {
    useComparisonStore.getState().setSharedBar(false);
    expect(useComparisonStore.getState().sharedBar).toBe(false);
    useComparisonStore.getState().setSharedBar(true);
    expect(useComparisonStore.getState().sharedBar).toBe(true);
  });
});
