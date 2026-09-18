interface TimestampWarningDialogProps {
  onClose: () => void;
}

/**
 * Aviso cuando hay vídeo cargado y la telemetría no tiene timestamp fiable
 * (el tiempo es el índice de muestra), por lo que la sincronización es
 * aproximada.
 */
export function TimestampWarningDialog({
  onClose,
}: TimestampWarningDialogProps): React.ReactElement {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 440 }}
      >
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--warn)' }}>
          Telemetría sin timestamp fiable
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Esta captura no incluye timestamps: el tiempo se calcula por el{' '}
          <strong>índice de muestra</strong> (0, 1, 2…). La <strong>sincronización con el vídeo</strong>{' '}
          será por tanto <strong>aproximada</strong>.
        </p>
        <div className="mt-4 flex justify-end">
          <button className="toolbar-button toolbar-button-primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
