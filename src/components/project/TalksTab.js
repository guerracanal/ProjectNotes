'use client';

import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import TalkCard from '../TalkCard';
import { parseTalks } from '@/lib/talks-parser';
import { useToast } from '@/contexts/ToastContext';

export default function TalksTab({ projectPath }) {
  const toast = useToast();
  const [talks, setTalks] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const encoded = projectPath.split('/').map(encodeURIComponent).join('/');
        const res = await fetch(`/api/projects/${encoded}/talks.md?type=file`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        if (!cancelled) setTalks(parseTalks(data.content));
      } catch (error) {
        if (!cancelled) {
          setTalks([]);
          toast.error(`No se pudo leer talks.md: ${error.message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectPath, toast]);

  if (talks === null) {
    return (
      <div className="grid-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 220, borderRadius: 'var(--r-lg)' }} />
        ))}
      </div>
    );
  }

  if (talks.length === 0) {
    return (
      <EmptyState
        icon="presentation"
        title="Sin charlas"
        description="Añade entradas a talks.md con un encabezado por charla y propiedades como Date, Video o Slides."
      />
    );
  }

  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="presentation" size={17} />
          Charlas
        </h2>
        <span className="badge">{talks.length}</span>
      </div>
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}>
        {talks.map((talk, i) => (
          <TalkCard key={`${talk.title}-${i}`} talk={talk} />
        ))}
      </div>
    </div>
  );
}
