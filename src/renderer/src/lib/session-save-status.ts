/**
 * Estado del Serial y de "se puede guardar la sesión", derivados del tiempo
 * transcurrido desde el último dato recibido.
 */

/** Silencio (ms) tras el cual se considera que la transmisión terminó. */
export const STALE_TRANSMISSION_MS = 2000;

export type SerialStatusLabel = 'desconectado' | 'recibiendo' | 'en reposo';

export interface SerialStatusInput {
  serialConnected: boolean;
  lastDataAt: number | null;
  now: number;
  staleMs?: number;
}

/** ¿Se están recibiendo datos activamente (dato reciente y puerto abierto)? */
export function isReceivingData({
  serialConnected,
  lastDataAt,
  now,
  staleMs = STALE_TRANSMISSION_MS,
}: SerialStatusInput): boolean {
  if (!serialConnected || lastDataAt == null) return false;
  return now - lastDataAt < staleMs;
}

/** Etiqueta para la barra de estado. */
export function serialStatusLabel(input: SerialStatusInput): SerialStatusLabel {
  if (!input.serialConnected) return 'desconectado';
  return isReceivingData(input) ? 'recibiendo' : 'en reposo';
}

export interface SessionSaveStatusInput extends SerialStatusInput {
  frameCount: number;
}

export interface SessionSaveStatus {
  canSave: boolean;
  reason: string | null;
}

/**
 * Determina si se puede guardar la sesión y, si no, por qué.
 * - Sin datos → no.
 * - Recibiendo datos (dato reciente) → no, hasta que pare o se desconecte.
 * - Con datos y sin recepción activa → sí.
 */
export function sessionSaveStatus(input: SessionSaveStatusInput): SessionSaveStatus {
  if (input.frameCount === 0) {
    return {
      canSave: false,
      reason: 'No hay telemetría para guardar. Conecta el Serial o abre una sesión.',
    };
  }

  if (isReceivingData(input)) {
    const elapsedSeconds =
      input.lastDataAt != null ? Math.max(0, Math.round((input.now - input.lastDataAt) / 1000)) : 0;
    return {
      canSave: false,
      reason:
        `No se puede guardar todavía: se siguen recibiendo datos ` +
        `(último hace ${elapsedSeconds} s). Espera a que termine o desconecta el Serial.`,
    };
  }

  return { canSave: true, reason: null };
}
