import { useEffect, useRef } from 'react';
import { eventBus } from '@core/event-bus';
import type { EventMap } from '@core/types/events';

/**
 * Suscribe un handler al EventBus con cleanup automático.
 * El handler se mantiene actualizado via ref, evitando re-suscripciones.
 */
export function useEventListener<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = eventBus.on(event, (payload) => handlerRef.current(payload));
    return unsub;
  }, [event]);
}

export function useElectronApi(): Window['api'] | undefined {
  return typeof window !== 'undefined' ? window.api : undefined;
}
