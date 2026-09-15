import { useEffect } from 'react';
import { registerBuiltInWidgets } from '@widgets/register-widgets';
import { installRvfcPolyfill } from '@core/video-synchronizer';
import { AppShell } from './components/layout/AppShell';

registerBuiltInWidgets();

function App(): React.ReactElement {
  useEffect(() => {
    installRvfcPolyfill();
  }, []);

  return <AppShell />;
}

export default App;
