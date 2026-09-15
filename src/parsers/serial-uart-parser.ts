import type { ITelemetryParser, ParserMetadata } from './interfaces';
import type { TelemetryFrame, TelemetryDataset, FieldSchema } from '@core/types/telemetry';

/**
 * Parser para telemetría en streaming por Serial UART.
 *
 * Formato de línea: T:<ms>,S:<speed>,M:<left>,<right>,G:<gyro>
 * Ejemplo:          T:1234,S:1500,M:512,-510,G:15
 */
export class SerialUARTParser implements ITelemetryParser {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART',
    description: 'Parses live telemetry from a serial UART stream',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 10,
  };

  private frames: TelemetryFrame[] = [];
  private streamComplete = false;
  private startTime_ms: number | null = null;

  private readonly LINE_REGEX = /^T:(\d+),S:(-?\d+),M:(-?\d+),(-?\d+),G:(-?\d+)/;

  canParse(_data: ArrayBuffer, _filename: string): boolean {
    return false;
  }

  async parse(): Promise<TelemetryDataset> {
    throw new Error('Serial parser does not support file parsing. Use parseLine() instead.');
  }

  parseLine(line: string): TelemetryFrame | null {
    const match = this.LINE_REGEX.exec(line);
    if (!match) return null;

    const timestamp_ms = parseInt(match[1]!, 10);
    const speed_rpm = parseInt(match[2]!, 10);
    const motor_left = parseInt(match[3]!, 10);
    const motor_right = parseInt(match[4]!, 10);
    const gyro_z = parseInt(match[5]!, 10);

    if (this.startTime_ms === null) {
      this.startTime_ms = timestamp_ms;
    }

    const frame: TelemetryFrame = {
      timestamp_ms,
      data: {
        speed_rpm,
        motor_left,
        motor_right,
        gyro_z,
      },
    };

    this.frames.push(frame);
    return frame;
  }

  isStreamComplete(): boolean {
    return this.streamComplete;
  }

  completeStream(): void {
    this.streamComplete = true;
  }

  getDiscoveredSchema(): FieldSchema[] {
    return [
      { name: 'speed_rpm', type: 'number', unit: 'RPM', recommendedWidget: 'timeseries' },
      { name: 'motor_left', type: 'number', unit: 'PWM', min: -1000, max: 1000, recommendedWidget: 'timeseries' },
      { name: 'motor_right', type: 'number', unit: 'PWM', min: -1000, max: 1000, recommendedWidget: 'timeseries' },
      { name: 'gyro_z', type: 'number', unit: '°/s', recommendedWidget: 'timeseries' },
    ];
  }

  buildDataset(name: string): TelemetryDataset {
    const frames = [...this.frames];
    frames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const startTime_ms = frames.length > 0 ? frames[0].timestamp_ms : 0;
    const endTime_ms = frames.length > 0 ? frames[frames.length - 1].timestamp_ms : 0;
    const duration_ms = endTime_ms - startTime_ms;

    return {
      id: `serial-${Date.now()}`,
      name,
      frames,
      schema: this.getDiscoveredSchema(),
      startTime_ms,
      endTime_ms,
      duration_ms,
      avgSampleRate_hz: duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
      frameCount: frames.length,
      source: { type: 'serial', port: '', baudRate: 115200 },
    };
  }

  get frameCount(): number {
    return this.frames.length;
  }

  destroy(): void {
    this.frames = [];
    this.streamComplete = false;
    this.startTime_ms = null;
  }
}
