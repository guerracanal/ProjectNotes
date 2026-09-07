'use client';

import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import Icon from './ui/Icon';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { normalizeProfile } from '@/lib/user-profile';

/**
 * Quién eres, para que el asistente lo sepa.
 *
 * Importa más de lo que parece: en una transcripción nadie dice «el usuario»,
 * dice tu nombre. Sin esto, preguntar «¿qué tareas tengo?» no encuentra el
 * momento en que alguien te asignó una.
 */
export default function ProfileModal({ isOpen, onClose }) {
  const { settings, updateSettings } = useSettings();
  const toast = useToast();

  // El componente se monta solo cuando se abre, así que los campos parten de
  // los ajustes sin necesidad de sincronizarlos con un efecto.
  const [name, setName] = useState(settings.userName || '');
  const [aliases, setAliases] = useState(settings.userAliases || '');
  const [envProfile, setEnvProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEnvProfile(data);
      })
      .catch(() => {
        if (!cancelled) setEnvProfile({ isSet: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = () => {
    updateSettings({ userName: name.trim(), userAliases: aliases.trim() });
    onClose();
    toast.success(
      name.trim() ? `El asistente ya sabe que eres ${name.trim()}` : 'Perfil borrado'
    );
  };

  const preview = normalizeProfile({ name, aliases });
  const usingEnv = !preview.isSet && envProfile?.isSet;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tu perfil"
      icon="user"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="save" size={15} />
            Guardar
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">
        El asistente lo usa para saber a quién te refieres cuando preguntas por
        «mis tareas» o «qué me comprometí a hacer», y para encontrar los momentos
        en que te nombran en una reunión.
      </p>

      <div className="field">
        <label className="label" htmlFor="profile-name">
          Tu nombre
        </label>
        <input
          id="profile-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jorge Guerra"
          autoComplete="name"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="profile-aliases">
          Otras formas en que te nombran
        </label>
        <input
          id="profile-aliases"
          className="input"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Jorge, Guerra, Jorgito"
        />
        <span className="text-xs text-subtle">
          Separadas por comas. En una transcripción rara vez sale tu nombre
          completo, así que cuantas más formas, mejor.
        </span>
      </div>

      {preview.isSet && (
        <div className="profile-preview">
          <Icon name="check-circle" size={15} />
          <span>
            El asistente te buscará como{' '}
            {preview.aliases.map((alias, i) => (
              <span key={alias}>
                {i > 0 && ', '}
                <strong>{alias}</strong>
              </span>
            ))}
            .
          </span>
        </div>
      )}

      {usingEnv && (
        <div className="profile-preview env">
          <Icon name="info" size={15} />
          <span>
            Ahora mismo se usa lo configurado en el servidor:{' '}
            <strong>{envProfile.name}</strong>. Lo que escribas aquí tiene
            prioridad.
          </span>
        </div>
      )}

      <style jsx>{`
        .profile-preview {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-2);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--success-soft);
          font-size: var(--fs-sm);
          color: var(--text-muted);
          line-height: 1.5;
        }

        .profile-preview :global(svg) {
          color: var(--success);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .profile-preview.env {
          background: var(--info-soft);
        }

        .profile-preview.env :global(svg) {
          color: var(--info);
        }

        .profile-preview strong {
          color: var(--text);
        }
      `}</style>
    </Modal>
  );
}
