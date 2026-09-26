import { app, ipcMain, net } from 'electron';
import { isNewerVersion } from '../shared/version';

/** Repo del que se consultan las releases. */
const RELEASES_URL = 'https://api.github.com/repos/OPRobots/TelemetryStudio/releases/latest';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  url?: string;
  notes?: string;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  draft?: boolean;
}

/**
 * Consulta la última release publicada de GitHub y la compara con la versión
 * actual. Nunca lanza: ante cualquier error de red devuelve `hasUpdate: false`.
 * (El endpoint `/releases/latest` ignora drafts y prereleases.)
 */
async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await net.fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Telemetry-Studio',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return { hasUpdate: false, currentVersion };

    const data = (await response.json()) as GithubRelease;
    if (data.draft || !data.tag_name) return { hasUpdate: false, currentVersion };

    return {
      hasUpdate: isNewerVersion(currentVersion, data.tag_name),
      currentVersion,
      latestVersion: data.tag_name.replace(/^v/i, ''),
      url: data.html_url,
      notes: data.body,
    };
  } catch {
    return { hasUpdate: false, currentVersion };
  }
}

/** Registra el handler IPC de comprobación de actualizaciones. */
export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', () => checkForUpdate());
}
