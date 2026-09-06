import Icon from './Icon';

export default function EmptyState({ icon = 'layers', title, description, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={34} strokeWidth={1.4} />
      {title && <h4>{title}</h4>}
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
