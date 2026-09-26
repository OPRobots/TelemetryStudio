import { useRef } from 'react';

interface BannerProps {
  /** Si el banner está visible. */
  open: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Envuelve un banner para que aparezca/desaparezca con una animación de altura
 * (se desplaza hacia abajo al mostrarse y hacia arriba al ocultarse). Mantiene
 * el contenido durante el cierre para que la transición no sea brusca.
 *
 * El contenedor permanece montado (altura 0 cuando está cerrado), así la
 * animación se reproduce tanto al entrar como al salir.
 */
export function Banner({ open, className, style, children }: BannerProps): React.ReactElement {
  const lastChildren = useRef<React.ReactNode>(children);
  if (open) lastChildren.current = children;

  return (
    <div
      className={`banner-collapse${open ? ' banner-collapse--open' : ''}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="banner-collapse__inner">
        <div className={className} style={style}>
          {open ? children : lastChildren.current}
        </div>
      </div>
    </div>
  );
}
