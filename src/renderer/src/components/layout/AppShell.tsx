import { useCallback, useEffect, useRef, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { VideoPlayer } from '../video/VideoPlayer';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { SplitView } from './SplitView';
import { Splitter } from './Splitter';
import { WidgetHost } from '../widgets/WidgetHost';
import { WidgetToolbar } from '../widgets/WidgetToolbar';
import { Banner } from './Banner';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { LayoutDialog } from '../dialogs/LayoutDialog';
import { SaveSessionDialog } from '../dialogs/SaveSessionDialog';
import { SessionBrowserDialog } from '../dialogs/SessionBrowserDialog';
import { ComparisonDialog } from '../dialogs/ComparisonDialog';
import { ExportDialog } from '../dialogs/ExportDialog';
import { PrepareVideoDialog } from '../dialogs/PrepareVideoDialog';
import { AboutDialog } from '../dialogs/AboutDialog';
import { TimestampWarningDialog } from '../dialogs/TimestampWarningDialog';
import { UpdateConsentDialog } from '../dialogs/UpdateConsentDialog';
import {
  openVideoDialog,
  openSessionDialog,
  loadSession,
  loadVideoFile,
  closeVideo,
} from '../../lib/session-actions';
import { serialIngest } from '../../lib/serial-ingest';
import { layoutManager, createEmptyLayout } from '@services/layout-manager';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { DEFAULT_PANELS } from '@core/types/layout';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function AppShell(): React.ReactElement {
  const [serialOpen, setSerialOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [timestampWarningOpen, setTimestampWarningOpen] = useState(false);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [updateConsentOpen, setUpdateConsentOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url?: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'none' | 'error' | null>(null);
  const [checkUpdates, setCheckUpdates] = useState(true);
  const warnedTimestampRef = useRef(false);
  const updateInitRef = useRef(false);
  const checkUpdatesRef = useRef(true);
  checkUpdatesRef.current = checkUpdates;
  const lastUpdateStatusRef = useRef<'none' | 'error'>('none');
  if (updateStatus) lastUpdateStatusRef.current = updateStatus;
  const statusVariant = updateStatus ?? lastUpdateStatusRef.current;

  const videoSrc = useAppStore((s) => s.videoSrc);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const videoFps = useAppStore((s) => s.videoFps);
  const appError = useAppStore((s) => s.errorMessage);
  const setError = useAppStore((s) => s.setError);

  const panels = useLayoutStore((s) => s.panels);
  const setPanels = useLayoutStore((s) => s.setPanels);

  const comparisonActive = useComparisonStore((s) => s.active);
  const comparisonError = useComparisonStore((s) => s.errorMessage);
  const serialConnected = useAppStore((s) => s.serialConnected);
  const frameCount = useAppStore((s) => s.frameCount);
  const telemetryTimeReliable = useAppStore((s) => s.telemetryTimeReliable);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Altura medida de la columna para convertir el ratio del vídeo a píxeles
  const sectionRef = useRef<HTMLDivElement>(null);
  const [sectionHeight, setSectionHeight] = useState(600);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setSectionHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [comparisonActive]);

  const videoHeight = clamp(Math.round(panels.videoRatio * sectionHeight), 160, Math.max(160, sectionHeight - 220));

  const stopComparison = (): void => {
    comparisonManager.stopComparison();
    useComparisonStore.getState().stop();
  };

  const runUpdateCheck = useCallback(async (manual: boolean): Promise<void> => {
    const api = window.api;
    if (!api) return;
    if (manual) setUpdateStatus(null);
    try {
      const result = await api.checkForUpdates();
      if (result.hasUpdate && result.latestVersion) {
        if (!manual) {
          const { dismissedVersion } = await api.settingsGetUpdate();
          if (dismissedVersion === result.latestVersion) return;
        }
        setUpdateInfo({ version: result.latestVersion, url: result.url });
        setUpdateStatus(null);
      } else if (manual) {
        setUpdateInfo(null);
        setUpdateStatus('none');
      }
    } catch {
      if (manual) setUpdateStatus('error');
    }
  }, []);

  const dismissUpdate = (): void => {
    const version = updateInfo?.version;
    setUpdateInfo(null);
    if (version) void window.api?.settingsSetUpdate({ dismissedVersion: version }).catch(() => undefined);
  };

  const handleUpdateConsent = async (enable: boolean): Promise<void> => {
    setUpdateConsentOpen(false);
    setCheckUpdates(enable);
    try {
      await window.api?.settingsSetUpdate({ consentGiven: true, checkOnStartup: enable });
    } catch {
      // sin ajustes persistentes: se sigue solo en memoria
    }
    if (enable) void runUpdateCheck(true);
  };

  // Acciones del menú nativo
  useEffect(() => {
    const unsubscribe = window.api?.menuOnAction((action) => {
      switch (action) {
        case 'open-video':
          void openVideoDialog();
          break;
        case 'close-video':
          closeVideo();
          break;
        case 'open-session':
          void openSessionDialog();
          break;
        case 'browse-sessions':
          setSessionsOpen(true);
          break;
        case 'save-session':
          setSaveOpen(true);
          break;
        case 'export-video': {
          const state = useAppStore.getState();
          if (state.frameCount === 0) {
            state.setStatusMessage('Carga telemetría para exportar');
            break;
          }
          setExportOpen(true);
          break;
        }
        case 'connect-serial':
          setSerialOpen(true);
          break;
        case 'disconnect-serial':
          void serialIngest.disconnect();
          break;
        case 'compare':
          setCompareOpen(true);
          break;
        case 'stop-comparison':
          stopComparison();
          break;
        case 'toggle-inspector': {
          const current = useLayoutStore.getState().panels.inspectorVisible;
          useLayoutStore.getState().setPanels({ inspectorVisible: !current });
          break;
        }
        case 'layouts':
          setLayoutsOpen(true);
          break;
        case 'new-layout': {
          const layout = createEmptyLayout('Sin guardar');
          useLayoutStore.getState().setLayout(layout);
          layoutManager.loadLayout(layout);
          break;
        }
        case 'check-updates':
          void runUpdateCheck(true);
          break;
        case 'toggle-update-check': {
          const next = !checkUpdatesRef.current;
          setCheckUpdates(next);
          void window.api
            ?.settingsSetUpdate({ checkOnStartup: next, consentGiven: true })
            .catch(() => undefined);
          break;
        }
        case 'about':
          setAboutOpen(true);
          break;
        default:
          break;
      }
    });
    return () => unsubscribe?.();
  }, [runUpdateCheck]);

  // Sincroniza el estado al menú nativo (checkbox de inspector, ítems habilitados).
  useEffect(() => {
    window.api?.menuSetState({
      inspectorVisible: panels.inspectorVisible,
      serialConnected,
      comparisonActive,
      hasVideo: !!videoSrc,
      hasData: frameCount > 0,
      checkUpdates,
    });
  }, [panels.inspectorVisible, serialConnected, comparisonActive, videoSrc, frameCount, checkUpdates]);

  // Primer arranque: pide consentimiento o comprueba actualizaciones si está activado.
  useEffect(() => {
    if (updateInitRef.current) return;
    updateInitRef.current = true;
    const api = window.api;
    if (!api) return;
    void (async () => {
      try {
        const settings = await api.settingsGetUpdate();
        setCheckUpdates(settings.checkOnStartup);
        if (settings.consentGiven !== true) {
          setUpdateConsentOpen(true);
        } else if (settings.checkOnStartup) {
          void runUpdateCheck(false);
        }
      } catch {
        // Sin ajustes disponibles (p. ej. tests): no molestar.
      }
    })();
  }, [runUpdateCheck]);

  // El aviso del chequeo manual ("al día" / "no se pudo") se oculta solo.
  useEffect(() => {
    if (!updateStatus) return;
    const id = window.setTimeout(() => setUpdateStatus(null), 4500);
    return () => window.clearTimeout(id);
  }, [updateStatus]);

  // Aviso: vídeo cargado + telemetría sin timestamp fiable.
  useEffect(() => {
    const shouldWarn = !!videoSrc && frameCount > 0 && !telemetryTimeReliable;
    if (shouldWarn && !warnedTimestampRef.current) {
      warnedTimestampRef.current = true;
      setTimestampWarningOpen(true);
      setStatusMessage('Datos sin timestamp fiable: sincronización con el vídeo aproximada');
    }
    if (!videoSrc) warnedTimestampRef.current = false;
  }, [videoSrc, frameCount, telemetryTimeReliable, setStatusMessage]);

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const path = window.api?.getPathForFile(file);
    if (!path) return;

    if (/\.(mp4|webm|mov|mkv)$/i.test(path)) {
      void loadVideoFile(path).catch((err) =>
        useAppStore.getState().setError((err as Error).message)
      );
    } else if (/\.json$/i.test(path)) {
      void loadSession(path).catch((err) =>
        useAppStore.getState().setError((err as Error).message)
      );
    }
  };

  return (
    <div
      className="flex h-screen flex-col"
      style={{ backgroundColor: 'var(--bg-app)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Banner
        open={!!updateInfo}
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{
          backgroundColor: 'var(--accent-soft)',
          color: 'var(--accent)',
          borderBottom: '1px solid var(--accent-border)',
        }}
      >
        {updateInfo ? (
          <>
            <span className="truncate">Nueva versión {updateInfo.version} disponible.</span>
            <div className="flex items-center gap-2">
              <button
                className="toolbar-button toolbar-button--compact"
                onClick={() => void window.api?.openExternal(updateInfo.url ?? '')}
              >
                Ver release
              </button>
              <button className="icon-button" onClick={dismissUpdate} title="Descartar">
                ✕
              </button>
            </div>
          </>
        ) : null}
      </Banner>

      <Banner
        open={!updateInfo && !!updateStatus}
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{
          backgroundColor:
            statusVariant === 'error' ? 'rgba(242, 190, 34, 0.12)' : 'var(--bg-hover)',
          color: statusVariant === 'error' ? 'var(--warn)' : 'var(--text-secondary)',
          borderBottom:
            statusVariant === 'error'
              ? '1px solid rgba(242, 190, 34, 0.35)'
              : '1px solid var(--bg-border)',
        }}
      >
        {updateStatus ? (
          <>
            <span className="truncate">
              {statusVariant === 'error'
                ? 'No se pudo comprobar actualizaciones (sin conexión o repo privado).'
                : 'No hay actualizaciones nuevas: estás en la última versión.'}
            </span>
            <button
              className="icon-button"
              onClick={() => setUpdateStatus(null)}
              title="Descartar"
            >
              ✕
            </button>
          </>
        ) : null}
      </Banner>

      <Banner
        open={!!appError}
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{
          backgroundColor: 'rgba(248, 113, 113, 0.12)',
          color: 'var(--error)',
          borderBottom: '1px solid rgba(248, 113, 113, 0.35)',
        }}
      >
        {appError ? (
          <>
            <span className="truncate">{appError}</span>
            <button className="icon-button" onClick={() => setError(null)} title="Descartar">
              ✕
            </button>
          </>
        ) : null}
      </Banner>

      <Banner
        open={!!comparisonError}
        className="px-4 py-1.5 text-xs"
        style={{
          backgroundColor: 'rgba(248, 113, 113, 0.12)',
          color: 'var(--error)',
          borderBottom: '1px solid rgba(248, 113, 113, 0.35)',
        }}
      >
        {comparisonError ? <span className="truncate">{comparisonError}</span> : null}
      </Banner>

      <main className="flex min-h-0 flex-1 overflow-hidden p-3">
        {panels.inspectorVisible && (
          <>
            <Inspector width={panels.inspectorWidth} />
            <Splitter
              orientation="vertical"
              value={panels.inspectorWidth}
              min={200}
              max={480}
              label="Ancho del inspector"
              onChange={(v) => setPanels({ inspectorWidth: Math.round(v) })}
              onReset={() => setPanels({ inspectorWidth: DEFAULT_PANELS.inspectorWidth })}
            />
          </>
        )}

        {comparisonActive ? (
          <div ref={sectionRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SplitView />
          </div>
        ) : (
          <div ref={sectionRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {videoSrc && (
              <>
                <div className="card" style={{ height: videoHeight, flexShrink: 0 }}>
                  <div className="card__header">
                    <span className="card__title">Vídeo</span>
                    <div className="flex items-center gap-1">
                      <span className="card__subtitle">{videoInfo?.filename ?? 'sin cargar'}</span>
                      <button
                        className="icon-button icon-button--compact"
                        title="Cerrar vídeo"
                        onClick={closeVideo}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="card__body" style={{ padding: 10 }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden',
                        backgroundColor: '#05070b',
                      }}
                    >
                      <VideoPlayer fps={videoFps} />
                    </div>
                  </div>
                  <div className="card__footer">
                    <Toolbar />
                  </div>
                </div>

                <Splitter
                  orientation="horizontal"
                  value={panels.videoRatio}
                  min={0.15}
                  max={0.8}
                  unit="ratio"
                  label="Alto del vídeo"
                  onChange={(v) => setPanels({ videoRatio: v })}
                  onReset={() => setPanels({ videoRatio: DEFAULT_PANELS.videoRatio })}
                />
              </>
            )}

            <div className="card" style={{ flex: '1 1 auto', minHeight: 0 }}>
              <div className="card__header">
                <span className="card__title">Telemetría</span>
                <WidgetToolbar open={widgetMenuOpen} onOpenChange={setWidgetMenuOpen} />
              </div>
              <div className="card__body card__body--fill" style={{ padding: 12 }}>
                <WidgetHost onRequestAdd={() => setWidgetMenuOpen(true)} />
              </div>
            </div>
          </div>
        )}
      </main>

      <StatusBar
        onOpenSerial={() => setSerialOpen(true)}
        onOpenVideo={() => void openVideoDialog()}
      />

      {serialOpen && <SerialConnectDialog onClose={() => setSerialOpen(false)} />}
      {layoutsOpen && <LayoutDialog onClose={() => setLayoutsOpen(false)} />}
      {saveOpen && <SaveSessionDialog onClose={() => setSaveOpen(false)} />}
      {sessionsOpen && <SessionBrowserDialog onClose={() => setSessionsOpen(false)} />}
      {compareOpen && <ComparisonDialog onClose={() => setCompareOpen(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {timestampWarningOpen && (
        <TimestampWarningDialog onClose={() => setTimestampWarningOpen(false)} />
      )}
      {updateConsentOpen && (
        <UpdateConsentDialog onChoice={(enable) => void handleUpdateConsent(enable)} />
      )}
      <PrepareVideoDialog />
    </div>
  );
}
