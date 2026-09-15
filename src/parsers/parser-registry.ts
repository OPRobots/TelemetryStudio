import type { ITelemetryParser } from './interfaces';

/**
 * Registro singleton de parsers disponibles.
 */
export class ParserRegistry {
  private parsers = new Map<string, ITelemetryParser>();

  register(parser: ITelemetryParser): void {
    const key = parser.metadata.name;
    if (this.parsers.has(key)) {
      console.warn(`Parser "${key}" already registered. Overwriting.`);
    }
    this.parsers.set(key, parser);
  }

  unregister(name: string): void {
    const parser = this.parsers.get(name);
    if (parser?.destroy) {
      parser.destroy();
    }
    this.parsers.delete(name);
  }

  get(name: string): ITelemetryParser | undefined {
    return this.parsers.get(name);
  }

  getAll(): ITelemetryParser[] {
    return Array.from(this.parsers.values())
      .sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  detectParser(data: ArrayBuffer, filename: string): ITelemetryParser | null {
    for (const parser of this.getAll()) {
      if (parser.canParse(data, filename)) {
        return parser;
      }
    }
    return null;
  }

  getStreamingParsers(): ITelemetryParser[] {
    return this.getAll().filter((p) => p.metadata.supportsStreaming);
  }

  destroyAll(): void {
    for (const parser of this.parsers.values()) {
      if (parser.destroy) parser.destroy();
    }
    this.parsers.clear();
  }
}

export const parserRegistry = new ParserRegistry();
