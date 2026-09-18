import type { ParserMetadata } from '../interfaces';
import { SerialParserBase, parseValue, hexBitWidth, type ParsedLine } from './serial-parser-base';

const LINE_REGEX = /^>\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/;

/**
 * Parser Legacy Macroarray: cada línea aporta **un único campo** con el prefijo
 * `>` como validación: `>{campo}:{valor}`. Los frames se forman agrupando
 * líneas hasta que se repite el primer campo. Si `hasTimestamp`, un campo
 * `t`/`time`/`timestamp` aporta el tiempo del frame.
 */
export class MacroArrayParser extends SerialParserBase {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART (Macroarray)',
    description: 'Un campo por línea con prefijo `>`: `>campo:valor`',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 30,
  };

  constructor(hasTimestamp: boolean) {
    super(hasTimestamp);
    this.groupLines = true;
  }

  protected parseLineFields(line: string): ParsedLine | null {
    const match = LINE_REGEX.exec(line);
    if (!match) return null;
    const name = match[1]!;
    const raw = match[2]!;
    const value = parseValue(raw);
    if (value === null) return null;

    // Un campo `t`/`time`/`timestamp` se trata como campo normal; la base lo
    // usa como tiempo del grupo y lo excluye de los datos (si `hasTimestamp`).
    return { fields: [[name, value, hexBitWidth(raw) ?? undefined]] };
  }
}
