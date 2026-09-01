function App(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--bg-border)' }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          OPRobots Telemetry Studio
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            v0.1.0
          </span>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside
          className="flex w-64 flex-col p-4"
          style={{ backgroundColor: 'var(--bg-elevated)', borderRight: '1px solid var(--bg-border)' }}
        >
          <div className="flex-1">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Panel lateral — Próximamente
            </p>
          </div>
        </aside>

        <section className="flex flex-1 flex-col items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
          <div className="text-center">
            <h2 className="mb-2 text-xl font-medium" style={{ color: 'var(--text-secondary)' }}>
              Área de trabajo
            </h2>
            <p className="text-sm">
              Carga un vídeo o conecta el serial para comenzar
            </p>
          </div>
        </section>
      </main>

      <footer
        className="flex items-center justify-between px-4 py-1 text-xs"
        style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--bg-border)', color: 'var(--text-tertiary)' }}
      >
        <span>Sin conexión</span>
        <span>0 frames</span>
      </footer>
    </div>
  );
}

export default App;
