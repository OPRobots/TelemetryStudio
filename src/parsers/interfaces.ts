import type { TelemetryFrame, TelemetryDataset, FieldSchema } from '@core/types/telemetry';

/**
 * Metadatos de un parser registrado.
 */
export interface ParserMetadata {
  name: string;
  description: string;
  extensions: string[];
  icon: string;
  supportsStreaming: boolean;
  priority: number;
}

/**
 * Interfaz que todo parser debe implementar.
 * Los parsers transforman datos brutos en TelemetryFrame[].
 */
export interface ITelemetryParser {
  readonly metadata: ParserMetadata;

  /**
   * Parsea un archivo completo y devuelve todos los frames.
   */
  parse(
    data: ArrayBuffer,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<TelemetryDataset>;

  /**
   * Valida si el archivo puede ser parseado por este parser.
   */
  canParse(data: ArrayBuffer, filename: string): boolean;

  /**
   * Parsea una sola línea de datos (modo streaming serial).
   */
  parseLine?(line: string): TelemetryFrame | null;

  /**
   * Indica si el stream ha terminado y el schema está completo.
   */
  isStreamComplete?(): boolean;

  /**
   * Obtiene el schema de campos descubierto durante el streaming.
   */
  getDiscoveredSchema?(): FieldSchema[];

  /**
   * Limpia recursos al destruir el parser.
   */
  destroy?(): void;
}
