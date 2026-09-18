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

const DEFAULTS: SerialSettings = {
  kind: 'keyvalue',
  hasTimestamp: true,
  csvSeparator: ',',
  csvLabels: [],
};

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json');

let cache: SerialSettings | null = null;

/** Configuración de conexión Serial recordada entre sesiones. */
export function getSerialSettings(): SerialSettings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as {
      serial?: Partial<SerialSettings>;
    };
    cache = { ...DEFAULTS, ...(raw.serial ?? {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setSerialSettings(patch: Partial<SerialSettings>): void {
  const next: SerialSettings = { ...getSerialSettings(), ...patch };
  cache = next;
  try {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify({ serial: next }, null, 2));
  } catch (err) {
    console.error('No se pudo guardar settings.json:', (err as Error).message);
  }
}
