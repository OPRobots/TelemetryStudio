import { describe, it, expect, beforeEach } from 'vitest';
import { useCursorStore } from '@renderer/stores/cursor-store';

describe('cursor-store', () => {
  beforeEach(() => {
    useCursorStore.getState().clear();
    useCursorStore.getState().clearZoom();
  });

  it('starts with no hover timestamp', () => {
    expect(useCursorStore.getState().hoverTimestamp_ms).toBeNull();
  });

  it('sets the hover timestamp', () => {
    useCursorStore.getState().setHoverTimestamp(1234);
    expect(useCursorStore.getState().hoverTimestamp_ms).toBe(1234);
  });

  it('treats 0 as a valid timestamp', () => {
    useCursorStore.getState().setHoverTimestamp(0);
    expect(useCursorStore.getState().hoverTimestamp_ms).toBe(0);
  });

  it('clears the hover timestamp', () => {
    useCursorStore.getState().setHoverTimestamp(500);
    useCursorStore.getState().clear();
    expect(useCursorStore.getState().hoverTimestamp_ms).toBeNull();
  });

  it('accepts null to clear the hover', () => {
    useCursorStore.getState().setHoverTimestamp(500);
    useCursorStore.getState().setHoverTimestamp(null);
    expect(useCursorStore.getState().hoverTimestamp_ms).toBeNull();
  });

  it('starts with no zoom range', () => {
    expect(useCursorStore.getState().zoomRange).toBeNull();
  });

  it('sets and clears the zoom range', () => {
    useCursorStore.getState().setZoomRange({ startMs: 100, endMs: 900 });
    expect(useCursorStore.getState().zoomRange).toEqual({ startMs: 100, endMs: 900 });

    useCursorStore.getState().setZoomRange(null);
    expect(useCursorStore.getState().zoomRange).toBeNull();
  });

  it('clear() only clears the hover, not the zoom', () => {
    useCursorStore.getState().setHoverTimestamp(500);
    useCursorStore.getState().setZoomRange({ startMs: 100, endMs: 900 });
    useCursorStore.getState().clear();
    expect(useCursorStore.getState().hoverTimestamp_ms).toBeNull();
    expect(useCursorStore.getState().zoomRange).not.toBeNull();
  });

  it('clearZoom() only clears the zoom', () => {
    useCursorStore.getState().setHoverTimestamp(500);
    useCursorStore.getState().setZoomRange({ startMs: 100, endMs: 900 });
    useCursorStore.getState().clearZoom();
    expect(useCursorStore.getState().zoomRange).toBeNull();
    expect(useCursorStore.getState().hoverTimestamp_ms).toBe(500);
  });
});
