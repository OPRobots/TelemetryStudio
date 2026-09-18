import { SerialParserBase, DEFAULT_CSV_FIELDS } from './serial-parser-base';
import { KeyValueParser } from './key-value-parser';
import { CsvParser, type CsvSeparator } from './csv-parser';
import { MacroArrayParser } from './macro-array-parser';

export type SerialParserKind = 'keyvalue' | 'csv' | 'macroarray';

export interface SerialParserConfig {
  kind: SerialParserKind;
  /** Si la telemetría incluye timestamp (1ª columna/campo). */
  hasTimestamp: boolean;
  csv?: {
    separator: CsvSeparator;
    labels: string[];
  };
}

/**
 * Crea el parser Serial según la configuración elegida en el diálogo de
 * conexión.
 */
export function createSerialParser(config: SerialParserConfig): SerialParserBase {
  switch (config.kind) {
    case 'csv':
      return new CsvParser(config.hasTimestamp, config.csv?.separator ?? ',', config.csv?.labels ?? []);
    case 'macroarray':
      return new MacroArrayParser(config.hasTimestamp);
    case 'keyvalue':
    default:
      return new KeyValueParser(config.hasTimestamp);
  }
}

export { SerialParserBase, DEFAULT_CSV_FIELDS };
export type { CsvSeparator };
export { KeyValueParser, CsvParser, MacroArrayParser };
