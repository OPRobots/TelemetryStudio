import { useEffect, useState } from 'react';
import appIcon from '../../../../../build/icon.png';
import oprobotsFavicon from '../../assets/oprobots-favicon.png';
import robotalehLogo from '../../assets/robotaleh.svg';

const LINKS = {
  oprobotsWeb: 'https://oprobots.org',
  oprobotsGithub: 'https://github.com/OPRobots',
  robotalehWeb: 'https://robotaleh.dev',
  robotalehGithub: 'https://github.com/robotaleh',
  deepseek: 'https://deepseek.com',
};

interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps): React.ReactElement {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.api?.getVersion().then(setVersion);
  }, []);

  const openLink = (url: string) => (e: React.MouseEvent): void => {
    e.preventDefault();
    void window.api?.openExternal(url);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel about-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 470 }}
      >
        <header className="about-header">
          <img className="about-logo" src={appIcon} alt="OPRobots Telemetry Studio" />
          <div className="about-heading">
            <h2 className="about-title">OPRobots Telemetry Studio</h2>
            <span className="about-version">Versión {version || '—'}</span>
          </div>
        </header>

        <p className="about-desc">
          Aplicación de escritorio para analizar la telemetría de robots de competición
          sincronizada con vídeo.<br/><br/>Captura datos por UART en vivo o abre sesiones guardadas,
          muéstralos en gráficas, matrices de bits, minimapa y líneas de estado. Compara dos
          sesiones en paralelo y exporta vídeos con la telemetría superpuesta.<br/><br/>Funciona
          100% offline y es portable.
        </p>

        <div className="about-credits">
          <div className="about-credit">
            <img className="about-credit__icon about-credit__icon--round" src={robotalehLogo} alt="" />
            <div className="about-credit__body">
              <span className="about-credit__name">robotaleh</span>
              <span className="about-credit__links">
                <a href={LINKS.robotalehWeb} onClick={openLink(LINKS.robotalehWeb)}>
                  robotaleh.dev
                </a>
                <span className="about-credit__sep">·</span>
                <a href={LINKS.robotalehGithub} onClick={openLink(LINKS.robotalehGithub)}>
                  github.com/robotaleh
                </a>
              </span>
            </div>
          </div>

          <div className="about-credit">
            <img className="about-credit__icon" src={oprobotsFavicon} alt="" />
            <div className="about-credit__body">
              <span className="about-credit__name">OPRobots</span>
              <span className="about-credit__links">
                <a href={LINKS.oprobotsWeb} onClick={openLink(LINKS.oprobotsWeb)}>
                  OPRobots.org
                </a>
                <span className="about-credit__sep">·</span>
                <a href={LINKS.oprobotsGithub} onClick={openLink(LINKS.oprobotsGithub)}>
                  github.com/OPRobots
                </a>
              </span>
            </div>
          </div>
        </div>

        <div className="about-footer">
          <p className="about-note">
            Desarrollado por <strong>@robotaleh</strong> con la ayuda de{' '}
            <a href={LINKS.deepseek} onClick={openLink(LINKS.deepseek)}>
              DeepSeek
            </a>
            ,<br/> para uso personal del equipo <strong>OPRobots</strong>.<br/><br/>Publicado bajo la{' '}
            <strong>PolyForm Noncommercial License 1.0.0</strong>:<br/> se permite el uso personal y
            no comercial; queda <strong>prohibido el uso comercial</strong>.
          </p>
          <p className="about-stack">Electron · React · TypeScript · uPlot · FFmpeg</p>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="toolbar-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
