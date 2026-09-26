import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export type SerialParserKindSetting = 'keyvalue' | 'csv' | 'macroarray';

export interface SerialSettings {
  kind: SerialParserKindSetting;
  hasTimestamp: boolean;
  csvSeparator: ',' | ';' | ' ';
  csvLabels: string[];
}

export interface UpdateSettings {
  /** Si el usuario ya eligió en el primer arranque (activar o no). */
  consentGiven?: boolean;
  /** Si se comprueban actualizaciones al arrancar. */
  checkOnStartup: boolean;
  /** Versión que el usuario descartó (para no volver a avisar). */
  dismissedVersion?: string;
}

interface AppSettings {
  serial: SerialSettings;
  update: UpdateSettings;
}

const DEFAULT_SERIAL: SerialSettings = {
  kind: 'keyvalue',
  hasTimestamp: true,
  csvSeparator: ',',
  csvLabels: [],
};

const DEFAULT_UPDATE: UpdateSettings = {
  checkOnStartup: true,
};

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json');

let cache: AppSettings | null = null;

/** Lee settings.json aplicando defaults por sección (conserva el resto). */
function load(): AppSettings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<AppSettings>;
    cache = {
      serial: { ...DEFAULT_SERIAL, ...(raw.serial ?? {}) },
      update: { ...DEFAULT_UPDATE, ...(raw.update ?? {}) },
    };
  } catch {
    cache = { serial: { ...DEFAULT_SERIAL }, update: { ...DEFAULT_UPDATE } };
  }
  return cache;
}

function persist(settings: AppSettings): void {
  cache = settings;
  try {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('No se pudo guardar settings.json:', (err as Error).message);
  }
}

/** Configuración de conexión Serial recordada entre sesiones. */
export function getSerialSettings(): SerialSettings {
  return load().serial;
}

export function setSerialSettings(patch: Partial<SerialSettings>): void {
  const settings = load();
  persist({ ...settings, serial: { ...settings.serial, ...patch } });
}

/** Configuración de la comprobación de actualizaciones. */
export function getUpdateSettings(): UpdateSettings {
  return load().update;
}

export function setUpdateSettings(patch: Partial<UpdateSettings>): void {
  const settings = load();
  persist({ ...settings, update: { ...settings.update, ...patch } });
}
