import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  serialNumber?: string;
}

export interface SerialStatus {
  connected: boolean;
  error?: string;
}

type LineHandler = (line: string) => void;
type StatusHandler = (status: SerialStatus) => void;

/**
 * Servicio de SerialPort en el Main Process.
 *
 * Responsabilidad única: gestionar el puerto y reenviar cada línea
 * recibida al renderer. El parseo de telemetría ocurre en el renderer.
 */
export class SerialService {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private lineHandlers = new Set<LineHandler>();
  private statusHandlers = new Set<StatusHandler>();

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

  onLine(handler: LineHandler): () => void {
    this.lineHandlers.add(handler);
    return () => this.lineHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private emitLine(line: string): void {
    for (const h of this.lineHandlers) h(line);
  }

  private emitStatus(status: SerialStatus): void {
    for (const h of this.statusHandlers) h(status);
  }

  async open(path: string, baudRate: number): Promise<void> {
    if (this.port?.isOpen) {
      await this.close();
    }

    await new Promise<void>((resolve, reject) => {
      const port = new SerialPort({ path, baudRate, autoOpen: false });
      port.open((err) => {
        if (err) {
          reject(err);
        } else {
          this.port = port;
          resolve();
        }
      });
    });

    this.parser = this.port!.pipe(new ReadlineParser({ delimiter: '\n' }));
    this.parser.on('data', (data: Buffer | string) => {
      const line = data.toString().trim();
      if (line.length > 0) this.emitLine(line);
    });

    this.port!.on('error', (err) => {
      this.emitStatus({ connected: false, error: err.message });
    });

    this.port!.on('close', () => {
      this.emitStatus({ connected: false });
    });

    this.emitStatus({ connected: true });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }
      this.port.close(() => resolve());
    });
    this.port = null;
    this.parser = null;
    this.emitStatus({ connected: false });
  }

  get isConnected(): boolean {
    return this.port?.isOpen ?? false;
  }

  destroy(): void {
    void this.close();
    this.lineHandlers.clear();
    this.statusHandlers.clear();
  }
}

export const serialService = new SerialService();
