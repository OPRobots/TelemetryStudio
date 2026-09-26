interface UpdateConsentDialogProps {
  onChoice: (enable: boolean) => void;
}

/**
 * Pregunta la primera vez si activar la comprobación automática de
 * actualizaciones. La elección se recuerda y se puede cambiar en el menú Ayuda.
 */
export function UpdateConsentDialog({ onChoice }: UpdateConsentDialogProps): React.ReactElement {
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Comprobar actualizaciones
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Telemetry Studio puede consultar al arrancar si hay una versión nueva en GitHub y
          avisarte. Solo hace una petición de red; la descarga e instalación son siempre
          manuales. Puedes cambiarlo cuando quieras en <b>Ayuda</b>.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={() => onChoice(false)}>
            No activar
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={() => onChoice(true)}
          >
            Activar
          </button>
        </div>
      </div>
    </div>
  );
}
