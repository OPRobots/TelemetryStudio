import { useState } from 'react';
import { VideoPlayer } from '../video/VideoPlayer';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
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
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';

export function AppShell(): React.ReactElement {
  const [serialOpen, setSerialOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const videoSrc = useAppStore((s) => s.videoSrc);
  const appError = useAppStore((s) => s.errorMessage);
  const setError = useAppStore((s) => s.setError);
  const comparisonActive = useComparisonStore((s) => s.active);
  const comparisonError = useComparisonStore((s) => s.errorMessage);

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
      style={{ backgroundColor: 'var(--bg-primary)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <header
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--bg-border)' }}
      >
        <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          OPRobots Telemetry Studio
        </h1>
        <div className="flex items-center gap-2">
          <button className="toolbar-button" onClick={() => void openVideoDialog()}>
            Abrir vídeo
          </button>
          <button className="toolbar-button" onClick={() => void openSessionDialog()}>
            Abrir sesión
          </button>
          <button className="toolbar-button" onClick={() => setSerialOpen(true)}>
            Serial
          </button>
          <button
            className="toolbar-button"
            onClick={() => setExportOpen(true)}
            disabled={!videoSrc || comparisonActive}
          >
            Exportar
          </button>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            v1.0.0
          </span>
        </div>
      </header>

      {appError && (
        <div
          className="flex items-center justify-between px-4 py-1 text-xs"
          style={{ backgroundColor: '#F2051920', color: '#f87171', borderBottom: '1px solid #F20519' }}
        >
          <span className="truncate">{appError}</span>
          <button className="icon-button" onClick={() => setError(null)} title="Descartar">
            ✕
          </button>
        </div>
      )}

      {comparisonError && (
        <div
          className="px-4 py-1 text-xs"
          style={{ backgroundColor: '#F2051920', color: '#f87171', borderBottom: '1px solid #F20519' }}
        >
          {comparisonError}
        </div>
      )}

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          onOpenSerial={() => setSerialOpen(true)}
          onSaveSession={() => setSaveOpen(true)}
          onOpenLayouts={() => setLayoutsOpen(true)}
          onOpenSessions={() => setSessionsOpen(true)}
          onCompare={() => setCompareOpen(true)}
        />

        {comparisonActive ? (
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <SplitView />
          </section>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0" style={{ height: '42%' }}>
              {videoSrc ? (
                <VideoPlayer />
              ) : (
                <div
                  className="flex h-full flex-col items-center justify-center gap-2"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <p className="text-sm">Carga un vídeo para comenzar</p>
                  <button
                    className="toolbar-button toolbar-button-primary"
                    onClick={() => void openVideoDialog()}
                  >
                    Abrir vídeo
                  </button>
                </div>
              )}
            </div>

            {videoSrc && <Toolbar />}

            <div
              className="flex items-center justify-between px-3 py-1"
              style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--bg-border)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Widgets
              </span>
              <WidgetToolbar />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <WidgetHost />
            </div>
          </section>
        )}
      </main>

      <StatusBar />

      {serialOpen && <SerialConnectDialog onClose={() => setSerialOpen(false)} />}
      {layoutsOpen && <LayoutDialog onClose={() => setLayoutsOpen(false)} />}
      {saveOpen && <SaveSessionDialog onClose={() => setSaveOpen(false)} />}
      {sessionsOpen && <SessionBrowserDialog onClose={() => setSessionsOpen(false)} />}
      {compareOpen && <ComparisonDialog onClose={() => setCompareOpen(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
