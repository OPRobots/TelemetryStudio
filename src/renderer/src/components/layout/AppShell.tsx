import { useEffect, useRef, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { VideoPlayer } from '../video/VideoPlayer';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { SplitView } from './SplitView';
import { Splitter } from './Splitter';
import { WidgetHost } from '../widgets/WidgetHost';
import { WidgetToolbar } from '../widgets/WidgetToolbar';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { LayoutDialog } from '../dialogs/LayoutDialog';
import { SaveSessionDialog } from '../dialogs/SaveSessionDialog';
import { SessionBrowserDialog } from '../dialogs/SessionBrowserDialog';
import { ComparisonDialog } from '../dialogs/ComparisonDialog';
import { ExportDialog } from '../dialogs/ExportDialog';
import { openVideoDialog, openSessionDialog, loadSession, loadVideoFile } from '../../lib/session-actions';
import { serialIngest } from '../../lib/serial-ingest';
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
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);

  const videoSrc = useAppStore((s) => s.videoSrc);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const appError = useAppStore((s) => s.errorMessage);
  const setError = useAppStore((s) => s.setError);

  const panels = useLayoutStore((s) => s.panels);
  const setPanels = useLayoutStore((s) => s.setPanels);

  const comparisonActive = useComparisonStore((s) => s.active);
  const comparisonError = useComparisonStore((s) => s.errorMessage);

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

  // Acciones del menú nativo
  useEffect(() => {
    const unsubscribe = window.api?.menuOnAction((action) => {
      switch (action) {
        case 'open-video':
          void openVideoDialog();
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
        case 'export-video':
          setExportOpen(true);
          break;
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
        default:
          break;
      }
    });
    return () => unsubscribe?.();
  }, []);

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
      {appError && (
        <div
          className="flex items-center justify-between px-4 py-1.5 text-xs"
          style={{
            backgroundColor: 'rgba(248, 113, 113, 0.12)',
            color: 'var(--error)',
            borderBottom: '1px solid rgba(248, 113, 113, 0.35)',
          }}
        >
          <span className="truncate">{appError}</span>
          <button className="icon-button" onClick={() => setError(null)} title="Descartar">
            ✕
          </button>
        </div>
      )}

      {comparisonError && (
        <div
          className="px-4 py-1.5 text-xs"
          style={{
            backgroundColor: 'rgba(248, 113, 113, 0.12)',
            color: 'var(--error)',
            borderBottom: '1px solid rgba(248, 113, 113, 0.35)',
          }}
        >
          {comparisonError}
        </div>
      )}

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
          <div
            ref={sectionRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="card" style={{ height: videoHeight, flexShrink: 0 }}>
              <div className="card__header">
                <span className="card__title">Vídeo</span>
                <span className="card__subtitle">{videoInfo?.filename ?? 'sin cargar'}</span>
              </div>
              <div className="card__body" style={{ padding: 10 }}>
                {videoSrc ? (
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      backgroundColor: '#05070b',
                    }}
                  >
                    <VideoPlayer />
                  </div>
                ) : (
                  <button className="empty-drop" onClick={() => void openVideoDialog()}>
                    <span className="empty-drop__title">Sin vídeo</span>
                    <span className="empty-drop__hint">Pulsa para abrir o arrastra un .mp4</span>
                  </button>
                )}
              </div>
              {videoSrc && (
                <div className="card__footer">
                  <Toolbar />
                </div>
              )}
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

            <div className="card" style={{ flex: '1 1 auto', minHeight: 0 }}>
              <div className="card__header">
                <span className="card__title">Widgets</span>
                <WidgetToolbar open={widgetMenuOpen} onOpenChange={setWidgetMenuOpen} />
              </div>
              <div className="card__body" style={{ padding: 12 }}>
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
    </div>
  );
}
