import { describe, it, expect, beforeEach } from 'vitest';
import { useCursorStore } from '@renderer/stores/cursor-store';

describe('cursor-store', () => {
  beforeEach(() => {
    useCursorStore.getState().clear();
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
});
