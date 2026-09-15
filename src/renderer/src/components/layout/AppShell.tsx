import { useEffect, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { VideoPlayer } from '../video/VideoPlayer';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { SplitView } from './SplitView';
import { WidgetHost } from '../widgets/WidgetHost';
import { WidgetToolbar } from '../widgets/WidgetToolbar';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { LayoutDialog } from '../dialogs/LayoutDialog';
import { SaveSessionDialog } from '../dialogs/SaveSessionDialog';
import { SessionBrowserDialog } from '../dialogs/SessionBrowserDialog';
import { ComparisonDialog } from '../dialogs/ComparisonDialog';
import { ExportDialog } from '../dialogs/ExportDialog';
import { openVideoDialog, openSessionDialog, loadSession } from '../../lib/session-actions';
import { serialIngest } from '../../lib/serial-ingest';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';

export function AppShell(): React.ReactElement {
  const [serialOpen, setSerialOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);

  const videoSrc = useAppStore((s) => s.videoSrc);
  const appError = useAppStore((s) => s.errorMessage);
  const setError = useAppStore((s) => s.setError);
  const comparisonActive = useComparisonStore((s) => s.active);
  const comparisonError = useComparisonStore((s) => s.errorMessage);

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
        case 'toggle-inspector':
          setInspectorOpen((v) => !v);
          break;
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
      useAppStore.getState().setVideo(path, path);
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

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {inspectorOpen && <Inspector />}

        {comparisonActive ? (
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <SplitView />
          </section>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0" style={{ height: '42%', padding: '16px 20px 0' }}>
              {videoSrc ? (
                <VideoPlayer />
              ) : (
                <button className="empty-drop" onClick={() => void openVideoDialog()}>
                  <span className="empty-drop__title">Sin vídeo</span>
                  <span className="empty-drop__hint">Pulsa para abrir o arrastra un .mp4</span>
                </button>
              )}
            </div>

            {videoSrc && <Toolbar />}

            <div
              className="flex items-center justify-between"
              style={{ padding: '16px 20px 10px' }}
            >
              <span className="section-label" style={{ marginBottom: 0 }}>
                Widgets
              </span>
              <WidgetToolbar open={widgetMenuOpen} onOpenChange={setWidgetMenuOpen} />
            </div>

            <div className="min-h-0 flex-1" style={{ padding: '0 20px 20px' }}>
              <WidgetHost onRequestAdd={() => setWidgetMenuOpen(true)} />
            </div>
          </section>
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
