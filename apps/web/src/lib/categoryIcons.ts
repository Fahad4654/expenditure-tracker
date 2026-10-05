/**
 * Colour and icon vocabulary for the category forms. The palette and icon
 * tokens mirror the Flutter app (`categories_page.dart` / `category_avatar.dart`)
 * so a category looks the same on every surface.
 *
 * These are data values, not UI theme colours: they come from the API and are
 * stored on the category row.
 */
export const CATEGORY_COLORS: readonly [string, ...string[]] = [
  '#F97316',
  '#3B82F6',
  '#EC4899',
  '#EF4444',
  '#8B5CF6',
  '#10B981',
  '#06B6D4',
  '#22C55E',
  '#0EA5E9',
  '#64748B',
  '#F59E0B',
  '#14B8A6',
];

/** Icon tokens the API seeds, rendered as emoji (the web has no icon set). */
export const CATEGORY_ICON_GLYPHS: Record<string, string> = {
  utensils: '🍽️',
  car: '🚗',
  bag: '🛍️',
  receipt: '🧾',
  film: '🎬',
  heart: '❤️',
  book: '📚',
  wallet: '👛',
  briefcase: '💼',
  'trending-up': '📈',
  home: '🏠',
  gift: '🎁',
  fitness: '🏋️',
  pets: '🐾',
  child: '🧒',
  flight: '✈️',
  coffee: '☕',
  phone: '📱',
  bolt: '⚡',
  'shopping-cart': '🛒',
  school: '🎓',
  medical: '🩺',
  savings: '💰',
  dots: '⋯',
};

/** Emoji for a token; unknown or missing tokens fall back to the tag glyph. */
export function categoryGlyph(icon?: string | null): string {
  return (icon ? CATEGORY_ICON_GLYPHS[icon] : undefined) ?? '🏷️';
}
