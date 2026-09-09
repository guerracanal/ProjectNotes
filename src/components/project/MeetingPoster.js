'use client';

import Icon from '../ui/Icon';
import { meetingTitle } from '@/lib/meetings';

/**
 * La portada de una reunión sin grabación.
 *
 * Ocupa el hueco del reproductor cuando el vídeo no está —que es lo normal
 * desde que las grabaciones no se sincronizan con Drive— y dice de un vistazo
 * lo mismo que diría un fotograma: de qué reunión se trata, cuándo fue y
 * cuánto duró.
 *
 * Se dibuja en el navegador en vez de generar un PNG en disco a propósito: no
 * hay ficheros que crear, sincronizar ni rehacer al renombrar, sale al momento
 * para todas las reuniones que ya existan, y respeta el tema claro u oscuro.
 */

/** Segundos → «1 h 23 min» o «14 min». */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds / 60);
  const horas = Math.floor(total / 60);
  const minutos = total % 60;
  if (horas === 0) return `${minutos} min`;
  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`;
}

/**
 * Un tono estable para cada reunión.
 *
 * Que dos reuniones distintas no se vean iguales ayuda a distinguirlas en una
 * lista larga, y que el color no cambie entre recargas hace que se reconozcan.
 */
function hueFrom(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return hash;
}

export default function MeetingPoster({ meeting, compact = false }) {
  const titulo = meetingTitle(meeting.baseName);
  const fecha = meeting.date ? new Date(meeting.date) : null;
  const duracion = formatDuration(meeting.duration);
  const hue = hueFrom(meeting.baseName || 'reunión');

  const fechaLarga = fecha
    ? fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  // La hora solo si venía en el nombre: la del fichero es la de la última
  // escritura y decir «10:16» por eso sería inventarse el dato.
  const hora =
    fecha && meeting.dateFromName && (fecha.getHours() || fecha.getMinutes())
      ? fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <div className={`poster ${compact ? 'compact' : ''}`} role="img" aria-label={`Reunión ${titulo}${fechaLarga ? `, ${fechaLarga}` : ''}`}>
      <div className="poster-glow" />
      <div className="poster-inner">
        <span className="poster-mark">
          <Icon name="mic" size={compact ? 18 : 26} />
        </span>

        <h4 className="poster-title">{titulo}</h4>

        {fechaLarga && (
          <p className="poster-date">
            {fechaLarga}
            {hora && <span className="poster-time"> · {hora}</span>}
          </p>
        )}

        <div className="poster-meta">
          {duracion && (
            <span>
              <Icon name="clock" size={12} />
              {duracion}
            </span>
          )}
          <span>
            <Icon name="file-text" size={12} />
            Transcripción disponible
          </span>
        </div>
      </div>

      <span className="poster-note">
        <Icon name="video" size={12} />
        Grabación no disponible aquí
      </span>

      <style jsx>{`
        .poster {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: var(--radius-md);
          overflow: hidden;
          background:
            linear-gradient(150deg,
              hsl(${hue} 45% 22%) 0%,
              hsl(${(hue + 40) % 360} 40% 14%) 55%,
              hsl(${(hue + 70) % 360} 35% 11%) 100%);
          border: 1px solid var(--border);
          display: grid;
          place-items: center;
          text-align: center;
        }
        .poster.compact {
          aspect-ratio: 21 / 9;
        }

        /* Un punto de luz suelto: sin él el degradado se ve plano. */
        .poster-glow {
          position: absolute;
          inset: -40% 30% 40% -20%;
          background: radial-gradient(circle, hsl(${hue} 80% 60% / 0.28), transparent 70%);
          pointer-events: none;
        }

        .poster-inner {
          position: relative;
          padding: 20px 24px;
          max-width: 90%;
          display: grid;
          gap: 8px;
          justify-items: center;
        }

        .poster-mark {
          display: grid;
          place-items: center;
          width: ${compact ? '38px' : '52px'};
          height: ${compact ? '38px' : '52px'};
          border-radius: 50%;
          background: hsl(0 0% 100% / 0.12);
          border: 1px solid hsl(0 0% 100% / 0.18);
          color: #fff;
          margin-bottom: 4px;
        }

        .poster-title {
          margin: 0;
          font-size: ${compact ? '15px' : '19px'};
          font-weight: 650;
          line-height: 1.3;
          color: #fff;
          overflow-wrap: anywhere;
        }

        .poster-date {
          margin: 0;
          font-size: ${compact ? '12px' : '13px'};
          color: hsl(0 0% 100% / 0.78);
        }
        .poster-time {
          color: hsl(0 0% 100% / 0.6);
        }

        .poster-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 14px;
          justify-content: center;
          margin-top: 6px;
          font-size: 11.5px;
          color: hsl(0 0% 100% / 0.7);
        }
        .poster-meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .poster-note {
          position: absolute;
          left: 10px;
          bottom: 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: hsl(0 0% 0% / 0.35);
          color: hsl(0 0% 100% / 0.72);
          font-size: 10.5px;
          backdrop-filter: blur(4px);
        }
        .poster.compact .poster-note {
          display: none;
        }
      `}</style>
    </div>
  );
}
