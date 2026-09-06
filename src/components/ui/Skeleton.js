export function SkeletonText({ lines = 3, width = '100%' }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 ? '65%' : width }}
        />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 132 }) {
  return (
    <div className="grid-auto" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: 'var(--r-lg)' }} />
      ))}
    </div>
  );
}
