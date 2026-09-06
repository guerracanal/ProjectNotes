import Link from 'next/link';

export const metadata = { title: 'No encontrado' };

export default function NotFound() {
  return (
    <div className="card card-pad" style={{ textAlign: 'center', padding: 'var(--sp-12)' }}>
      <h1 className="page-title" style={{ marginBottom: 'var(--sp-2)' }}>
        No encontrado
      </h1>
      <p className="page-subtitle" style={{ marginBottom: 'var(--sp-5)' }}>
        La carpeta o página que buscas no existe dentro de <code>projects_data</code>.
      </p>
      <Link href="/" className="btn btn-primary">
        Volver al panel
      </Link>
    </div>
  );
}
