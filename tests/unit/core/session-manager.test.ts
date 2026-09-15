import { describe, it, expect, vi } from 'vitest';
import { SessionManager, type SessionStorageAdapter } from '@services/session-manager';
import type { SessionFile } from '@core/types/session';

const SESSION: SessionFile = {
  v: 1,
  name: 'Sesión de prueba',
  created: '2026-01-01T00:00:00Z',
  video: { file: 'video.mp4', fps: 30, duration_s: 5, resolution: [1920, 1080] },
  sync: { offset_ms: 10, anchor: null, rate: 1 },
  telemetry: {
    schema: [['speed', 'number']],
    frames: [
      [0, 100],
      [10, 200],
    ],
  },
  layout: { widgets: [{ t: 'TimeSeriesChart', pos: [0, 0], size: [4, 2], fields: ['speed'] }] },
};

function makeAdapter(): SessionStorageAdapter & { exported: unknown[] } {
  const exported: unknown[] = [];
  return {
    exported,
    readFile: vi.fn(async () => JSON.stringify(SESSION)),
    getVideoPath: vi.fn(async (jsonPath: string, file: string) => `${jsonPath}/../${file}`),
    exportSession: vi.fn(
      async (name: string, outputDir: string, jsonContent: string, videoPath: string) => {
        exported.push({ name, outputDir, jsonContent, videoPath });
        return `${outputDir}/${name}`;
      }
    ),
    listSessions: vi.fn(async () => [
      { name: 'A', path: '/sessions/A/session.json', createdAt: '2026-01-01' },
    ]),
  };
}

describe('SessionManager', () => {
  it('reads and decodes a session file', async () => {
    const adapter = makeAdapter();
    const manager = new SessionManager(adapter);

    const session = await manager.readSession('/sessions/A/session.json');
    expect(session.name).toBe('Sesión de prueba');
    expect(session.telemetry.frames).toHaveLength(2);
    expect(session.video.file).toBe('video.mp4');
  });

  it('throws when a session file cannot be read', async () => {
    const adapter = makeAdapter();
    adapter.readFile = vi.fn(async () => {
      throw new Error('missing');
    });
    const manager = new SessionManager(adapter);
    await expect(manager.readSession('/nope.json')).rejects.toThrow('missing');
  });

  it('resolves the video path relative to the session', async () => {
    const manager = new SessionManager(makeAdapter());
    expect(await manager.resolveVideoPath('/sessions/A', 'video.mp4')).toBe(
      '/sessions/A/../video.mp4'
    );
    expect(await manager.resolveVideoPath('/sessions/A', '')).toBe('');
  });

  it('persists an encoded session', async () => {
    const adapter = makeAdapter();
    const manager = new SessionManager(adapter);

    const dir = await manager.saveSession(SESSION, '/out', '/videos/video.mp4');
    expect(dir).toBe('/out/Sesión de prueba');
    expect(adapter.exported).toHaveLength(1);

    const call = adapter.exported[0] as { jsonContent: string; videoPath: string };
    expect(call.videoPath).toBe('/videos/video.mp4');
    expect(JSON.parse(call.jsonContent).name).toBe('Sesión de prueba');
  });

  it('lists sessions', async () => {
    const manager = new SessionManager(makeAdapter());
    const sessions = await manager.listSessions('/sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.name).toBe('A');
  });

  it('returns no sessions without an adapter', async () => {
    const manager = new SessionManager(null);
    expect(await manager.listSessions('/sessions')).toEqual([]);
    await expect(manager.readSession('/x.json')).rejects.toThrow(
      'Almacenamiento de sesiones no disponible'
    );
  });
});
