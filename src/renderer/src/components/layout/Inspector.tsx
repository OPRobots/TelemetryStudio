import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { startFieldDrag } from '../../lib/field-drag';

interface InspectorProps {
  width: number;
}

/**
 * Panel lateral izquierdo con los campos descubiertos.
 * La sincronización vive en la barra de controles del vídeo.
 * Los campos se pueden arrastrar a un widget para añadirlos (salvo en comparación).
 */
export function Inspector({ width }: InspectorProps): React.ReactElement {
  const schema = useAppStore((s) => s.schema);
  const comparisonActive = useComparisonStore((s) => s.active);

  return (
    <aside className="flex" style={{ width, flexShrink: 0 }}>
      <div className="card" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <div className="card__header">
          <span className="card__title">Campos · {schema.length}</span>
        </div>
        <div className="card__body" style={{ overflowY: 'auto', padding: 8 }}>
          {schema.length === 0 ? (
            <p className="hint" style={{ padding: '6px 6px 0' }}>
              Sin datos todavía. Conecta el robot por <strong>Datos → Conectar Serial</strong> o
              abre una sesión.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {schema.map((f) => (
                <div
                  key={f.name}
                  className="field-row"
                  onPointerDown={(e) => {
                    if (comparisonActive || e.button !== 0) return;
                    startFieldDrag(f.name);
                  }}
                  style={{ cursor: comparisonActive ? 'default' : 'grab' }}
                  title={comparisonActive ? undefined : 'Arrastra a un widget para añadir el campo'}
                >
                  <span className="field-name">{f.name}</span>
                  <span className={`badge badge--${f.type}`}>{f.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
