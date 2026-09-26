interface InfoHintProps {
  /** Texto breve que se muestra en el tooltip. */
  text: string;
}

/**
 * Pequeño icono `i` con un tooltip estilizado que aparece al pasar el ratón o
 * al enfocar. Se coloca a la derecha de la etiqueta de un campo.
 */
export function InfoHint({ text }: InfoHintProps): React.ReactElement {
  return (
    <span className="info-hint" tabIndex={0} role="note" aria-label={text}>
      i
      <span className="info-hint__tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
