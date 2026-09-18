import type { ParserMetadata } from '../interfaces';
import { SerialParserBase, parseValue, hexBitWidth, type ParsedLine } from './serial-parser-base';

const TIMESTAMP_REGEX = /^[Tt]\s*[:=]\s*(\d+)/;
const PAIR_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/;

/**
 * Parser por defecto: telemetría con claves.
 * Líneas del tipo `T:<ms>,campo:valor,campo:valor,…` (o `=` como separador).
 * Con `hasTimestamp` exige el prefijo `T/t`; sin él usa el modo grupos.
 */
export class KeyValueParser extends SerialParserBase {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART',
    description: 'Telemetría en vivo con líneas `T:<ms>,campo:valor,…`',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 10,
  };

  protected parseLineFields(line: string): ParsedLine | null {
    const tokens = line.split(',');
    let timestamp: number | undefined;
    let start = 0;

    if (this.hasTimestamp) {
      const match = TIMESTAMP_REGEX.exec(tokens[0] ?? '');
      if (!match) return null;
      timestamp = parseInt(match[1]!, 10);
      start = 1;
    }

    const fields: ParsedLine['fields'] = [];
    for (let i = start; i < tokens.length; i++) {
      const token = tokens[i]!.trim();
      if (!token) continue;
      const pair = PAIR_REGEX.exec(token);
      if (!pair) continue;
      const value = parseValue(pair[2]!);
      if (value === null) continue;
      fields.push([pair[1]!, value, hexBitWidth(pair[2]!) ?? undefined]);
    }
    if (fields.length === 0) return null;
    return { fields, timestamp };
  }
}
