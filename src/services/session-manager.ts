import { decodeSession, encodeSession } from '@core/session-codec';
import type { SessionFile } from '@core/types/session';

export interface SessionInfo {
  name: string;
  path: string;
  createdAt: string;
}

/**
 * Adaptador de almacenamiento de sesiones. Desacopla el servicio del bridge
 * de Electron para que sea testeable.
 */
export interface SessionStorageAdapter {
  readFile(path: string): Promise<string>;
  getVideoPath(jsonPath: string, videoFile: string): Promise<string>;
  exportSession(
    name: string,
    outputDir: string,
    jsonContent: string,
    videoPath: string
  ): Promise<string>;
  listSessions(directory: string): Promise<SessionInfo[]>;
}

function defaultAdapter(): SessionStorageAdapter | null {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (!api) return null;

  return {
    async readFile(path: string): Promise<string> {
      const result = await api.readFile(path);
      if (!result.success || result.content == null) {
        throw new Error(result.error ?? 'No se pudo leer el archivo de sesión');
      }
      return result.content;
    },
    getVideoPath: (jsonPath, videoFile) => api.sessionGetVideoPath(jsonPath, videoFile),
    exportSession: (name, outputDir, jsonContent, videoPath) =>
      api.sessionExport(name, outputDir, jsonContent, videoPath),
    listSessions: (directory) => api.sessionList(directory),
  };
}

/**
 * Servicio formal de sesiones (capa `services/`, sin dependencias del renderer).
 *
 * - Lee/decodifica sesiones.
 * - Persiste sesiones (JSON + copia del vídeo) a través del adaptador.
 * - Lista sesiones de un directorio.
 *
 * La orquestación con los stores del renderer vive en
 * `src/renderer/src/lib/session-actions.ts`.
 */
export class SessionManager {
  constructor(private adapter: SessionStorageAdapter | null = defaultAdapter()) {}

  private requireAdapter(): SessionStorageAdapter {
    if (!this.adapter) throw new Error('Almacenamiento de sesiones no disponible');
    return this.adapter;
  }

  async readSession(jsonPath: string): Promise<SessionFile> {
    const json = await this.requireAdapter().readFile(jsonPath);
    return decodeSession(json);
  }

  async resolveVideoPath(jsonPath: string, videoFile: string): Promise<string> {
    if (!videoFile) return '';
    return this.requireAdapter().getVideoPath(jsonPath, videoFile);
  }

  /**
   * Persiste un SessionFile en `outputDir` (crea carpeta + JSON + copia vídeo).
   * @param videoPath Ruta del vídeo original a copiar (vacío si no aplica).
   */
  async saveSession(session: SessionFile, outputDir: string, videoPath: string): Promise<string> {
    return this.requireAdapter().exportSession(
      session.name,
      outputDir,
      encodeSession(session),
      videoPath
    );
  }

  async listSessions(directory: string): Promise<SessionInfo[]> {
    if (!this.adapter) return [];
    return this.adapter.listSessions(directory);
  }
}

export const sessionManager = new SessionManager();
