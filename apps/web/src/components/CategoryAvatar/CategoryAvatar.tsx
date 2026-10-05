import { categoryGlyph } from '../../lib/categoryIcons';

/**
 * Coloured circle carrying the category glyph — the web counterpart of the
 * Flutter `CategoryAvatar`.
 */
export default function CategoryAvatar({
  color,
  icon,
  size = 36,
  className = '',
}: {
  color?: string | null;
  icon?: string | null;
  size?: number;
  className?: string;
}) {
  const tint = color ? `${color}2E` : 'rgba(100,116,139,0.15)';
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: tint,
        color: color ?? '#94a3b8',
      }}
    >
      <span style={{ fontSize: Math.round(size * 0.55) }}>{categoryGlyph(icon)}</span>
    </span>
  );
}
