import type { ParserMetadata } from '../interfaces';
import { SerialParserBase, parseValue, hexBitWidth, type ParsedLine } from './serial-parser-base';

export type CsvSeparator = ',' | ';' | ' ';

/**
 * Parser CSV posicional. El usuario fija el separador y las etiquetas.
 * - Con `hasTimestamp`: la **primera columna** es el timestamp (ms) y las
 *   etiquetas corresponden a las columnas restantes.
 * - Sin `hasTimestamp`: todas las columnas son datos y el tiempo se calcula
 *   por grupos (índice de muestra).
 * Valida estrictamente el número de columnas y el parseo de cada celda.
 */
export class CsvParser extends SerialParserBase {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART (CSV)',
    description: 'Telemetría en vivo con valores separados por comas/punto y coma/espacio',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 20,
  };

  constructor(
    hasTimestamp: boolean,
    private separator: CsvSeparator,
    private labels: string[]
  ) {
    super(hasTimestamp);
  }

  override get strict(): boolean {
    return true;
  }

  protected parseLineFields(line: string): ParsedLine | null {
    if (this.labels.length === 0) return null;

    const tokens =
      this.separator === ' '
        ? line.trim().split(/\s+/)
        : line.split(this.separator).map((t) => t.trim());

    const expected = this.labels.length + (this.hasTimestamp ? 1 : 0);
    if (tokens.length !== expected) return null;

    let timestamp: number | undefined;
    let start = 0;
    if (this.hasTimestamp) {
      const ts = parseValue(tokens[0]!);
      if (typeof ts !== 'number') return null;
      timestamp = Math.round(ts);
      start = 1;
    }

    const fields: ParsedLine['fields'] = [];
    for (let i = 0; i < this.labels.length; i++) {
      const raw = tokens[start + i]!;
      const value = parseValue(raw);
      if (value === null) return null;
      fields.push([this.labels[i]!, value, hexBitWidth(raw) ?? undefined]);
    }
    return { fields, timestamp };
  }
}
