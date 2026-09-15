import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { eventBus } from '@core/event-bus';
import type { TelemetryFrame } from '@core/types/telemetry';
import { SerialUARTParser } from '@parsers/serial-uart-parser';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  serialNumber?: string;
}

/**
 * Servicio de serial en Main Process.
 * Gestiona conexión, streaming y parsing de datos UART.
 */
export class SerialService {
  private port: SerialPort | null = null;
  private parser: SerialUARTParser = new SerialUARTParser();
  private readlineParser: ReadlineParser | null = null;

  /**
   * Lista puertos serie disponibles (filtrados, sin virtuales).
   */
  async listPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list();
    return ports
      .filter((p) => p.vendorId || p.manufacturer || p.serialNumber)
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        vendorId: p.vendorId,
        serialNumber: p.serialNumber,
      }));
  }

  /**
   * Abre conexión serial y comienza a emitir frames.
   */
  async open(path: string, baudRate: number): Promise<void> {
    if (this.port?.isOpen) {
      await this.close();
    }

    this.parser = new SerialUARTParser();

    this.port = new SerialPort({ path, baudRate, autoOpen: false });

    await new Promise<void>((resolve, reject) => {
      this.port!.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.readlineParser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.readlineParser.on('data', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const frame = this.parser.parseLine(trimmed);
      if (frame) {
        eventBus.emit('data:streaming-frame', { frame });
      }
    });

    this.port.on('error', (err) => {
      eventBus.emit('system:error', {
        source: 'serial',
        message: err.message,
      });
    });

    this.port.on('close', () => {
      this.parser.completeStream();
      eventBus.emit('data:streaming-stop', {});
    });

    eventBus.emit('data:streaming-start', {
      source: { type: 'serial', port: path, baudRate },
    });
  }

  /**
   * Cierra la conexión serial.
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }
      this.port.close(() => {
        resolve();
      });
    });
  }

  /**
   * Construye un TelemetryDataset con todos los frames recibidos.
   */
  buildDataset(name: string): import('@core/types/telemetry').TelemetryDataset {
    return this.parser.buildDataset(name);
  }

  /**
   * Parser interno (para tests y acceso directo).
   */
  get serialParser(): SerialUARTParser {
    return this.parser;
  }

  get isConnected(): boolean {
    return this.port?.isOpen ?? false;
  }

  destroy(): void {
    this.parser.destroy();
    if (this.port?.isOpen) {
      this.port.close();
    }
    this.port = null;
    this.readlineParser = null;
  }
}

export const serialService = new SerialService();
