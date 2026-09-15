import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@core/event-bus';

describe('EventBus', () => {
  it('should call listener when event is emitted', () => {
    const bus = new EventBus();
    const callback = vi.fn();

    bus.on('data:loaded', callback);
    bus.emit('data:loaded', { dataset: {} as any });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('should return cleanup function from on()', () => {
    const bus = new EventBus();
    const callback = vi.fn();

    const unsub = bus.on('data:loaded', callback);
    unsub();
    bus.emit('data:loaded', { dataset: {} as any });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should support multiple listeners on same event', () => {
    const bus = new EventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.on('data:loaded', cb1);
    bus.on('data:loaded', cb2);
    bus.emit('data:loaded', { dataset: {} as any });

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('should only call listener once with once()', () => {
    const bus = new EventBus();
    const callback = vi.fn();

    bus.once('data:loaded', callback);
    bus.emit('data:loaded', { dataset: {} as any });
    bus.emit('data:loaded', { dataset: {} as any });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('should remove all listeners of an event with off()', () => {
    const bus = new EventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.on('data:loaded', cb1);
    bus.on('data:loaded', cb2);
    bus.off('data:loaded');
    bus.emit('data:loaded', { dataset: {} as any });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('should clear all listeners with clear()', () => {
    const bus = new EventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.on('data:loaded', cb1);
    bus.on('video:play', cb2);
    bus.clear();
    bus.emit('data:loaded', { dataset: {} as any });
    bus.emit('video:play', {});

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('should catch errors in listeners without crashing', () => {
    const bus = new EventBus();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.on('data:loaded', () => {
      throw new Error('test error');
    });

    expect(() => {
      bus.emit('data:loaded', { dataset: {} as any });
    }).not.toThrow();

    consoleSpy.mockRestore();
  });
});
