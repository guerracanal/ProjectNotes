'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import ImageLightbox from '../ImageLightbox';
import { useToast } from '@/contexts/ToastContext';
import { formatBytes } from '@/lib/file-kinds';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export default function ImagesTab({ projectPath }) {
  const toast = useToast();
  const dropRef = useRef(null);
  const inputRef = useRef(null);

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodePath(projectPath)}/images?type=list`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch (error) {
      toast.error(`No se pudieron cargar las imágenes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [projectPath, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
      if (files.length === 0) {
        toast.warning('Solo se admiten ficheros de imagen');
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.append('projectPath', projectPath);
        files.forEach((file) => form.append('images', file));

        const res = await fetch('/api/projects/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

        await load();
        toast.success(
          `${data.files.length} imagen${data.files.length === 1 ? '' : 'es'} subida${data.files.length === 1 ? '' : 's'}`
        );
      } catch (error) {
        toast.error(`Error al subir: ${error.message}`);
      } finally {
        setUploading(false);
      }
    },
    [projectPath, load, toast]
  );

  // Paste-to-upload works anywhere in the tab, not just inside the dropzone —
  // screenshots are the most common way images get here.
  useEffect(() => {
    const onPaste = (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (files.length) upload(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [upload]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    upload(e.dataTransfer.files);
  };

  return (
    <div className="stack" style={{ gap: 'var(--sp-5)' }}>
      <div
        ref={dropRef}
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Ignore drags moving between children of the dropzone.
          if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <span className="dz-icon">
          <Icon name={uploading ? 'refresh' : 'image'} size={26} className={uploading ? 'spin' : ''} />
        </span>
        <h4>Arrastra imágenes aquí</h4>
        <p>También puedes pegar desde el portapapeles (⌘V) o elegir ficheros.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <span className="spinner" /> : <Icon name="upload" size={14} />}
          {uploading ? 'Subiendo…' : 'Elegir ficheros'}
        </button>
      </div>

      {loading ? (
        <div className="gallery">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '4/3', borderRadius: 'var(--r-md)' }} />
          ))}
        </div>
      ) : images.length === 0 ? (
        <EmptyState
          icon="image"
          title="Sin imágenes"
          description="Las capturas y fotos que subas se guardan en la subcarpeta images/ del proyecto."
        />
      ) : (
        <section>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="image" size={17} />
              Galería
            </h2>
            <span className="badge">{images.length}</span>
          </div>

          <div className="gallery">
            {images.map((image, index) => (
              <figure key={image.path} className="thumb">
                <button className="thumb-btn" onClick={() => setLightbox(index)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/projects/${encodePath(image.path)}?type=file`}
                    alt={image.name}
                    loading="lazy"
                  />
                </button>
                <figcaption>
                  <span className="truncate" title={image.name}>
                    {image.name}
                  </span>
                  <span className="text-subtle">{formatBytes(image.size)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {lightbox !== null && images.length > 0 && (
        <ImageLightbox
          images={images}
          currentIndex={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}

      <style jsx>{`
        .dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-8) var(--sp-4);
          text-align: center;
          border: 2px dashed var(--border-strong);
          border-radius: var(--r-lg);
          background: var(--surface-2);
          transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
        }

        .dropzone.dragging {
          border-color: var(--accent);
          background: var(--accent-soft);
        }

        .dz-icon {
          display: grid;
          place-items: center;
          width: 54px;
          height: 54px;
          border-radius: var(--r-lg);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .dz-icon :global(.spin) {
          animation: spin 1s linear infinite;
        }

        .dropzone h4 {
          font-size: var(--fs-md);
        }

        .dropzone p {
          font-size: var(--fs-sm);
          color: var(--text-muted);
          margin-bottom: var(--sp-2);
        }

        .gallery {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr));
          gap: var(--sp-3);
        }

        .thumb {
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          border-radius: var(--r-md);
          overflow: hidden;
        }

        .thumb-btn {
          display: block;
          border-radius: var(--r-md);
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--surface-2);
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur) var(--ease-out);
        }

        .thumb-btn:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        .thumb-btn img {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
        }

        figcaption {
          display: flex;
          justify-content: space-between;
          gap: var(--sp-2);
          padding-inline: 2px;
          font-size: var(--fs-2xs);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
