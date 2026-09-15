import type { EventMap } from './types/events';

type EventCallback<T> = (payload: T) => void;

/**
 * EventBus genérico tipado.
 * Cada evento tiene un payload conocido via EventMap.
 */
export class EventBus {
  private listeners = new Map<keyof EventMap, Set<EventCallback<never>>>();

  /**
   * Suscribe a un evento. Devuelve una función de cleanup.
   */
  on<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<never>);

    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<never>);
    };
  }

  /**
   * Emite un evento con su payload.
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          (cb as EventCallback<EventMap[K]>)(payload);
        } catch (error) {
          console.error(`Error in EventBus listener for "${String(event)}":`, error);
        }
      }
    }
  }

  /**
   * Suscribe a un evento una sola vez.
   */
  once<K extends keyof EventMap>(
    event: K,
    callback: EventCallback<EventMap[K]>
  ): () => void {
    const wrapper: EventCallback<EventMap[K]> = (payload) => {
      unsub();
      callback(payload);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }

  /**
   * Elimina todos los listeners de un evento.
   */
  off(event: keyof EventMap): void {
    this.listeners.delete(event);
  }

  /**
   * Elimina todos los listeners de todos los eventos.
   */
  clear(): void {
    this.listeners.clear();
  }
}

/** Singleton global del EventBus */
export const eventBus = new EventBus();
