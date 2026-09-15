import { useEffect } from 'react';
import { registerBuiltInWidgets } from '@widgets/register-widgets';
import { installRvfcPolyfill } from '@core/video-synchronizer';
import { AppShell } from './components/layout/AppShell';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './stores/app-store';

registerBuiltInWidgets();

function App(): React.ReactElement {
  useKeyboardShortcuts();

  useEffect(() => {
    installRvfcPolyfill();

    const onError = (event: ErrorEvent): void => {
      useAppStore.getState().setError(event.message || 'Error inesperado');
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason as { message?: string } | string | undefined;
      const message =
        typeof reason === 'string' ? reason : reason?.message ?? 'Promesa rechazada sin detalle';
      useAppStore.getState().setError(message);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return <AppShell />;
}

export default App;
