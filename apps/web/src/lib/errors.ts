import { ApiError } from './api';

interface Parsed {
  /** Maps a field name to its first message. */
  fields: Record<string, string>;
  /** Message to show above the form, or `null` when it is purely field-level. */
  message: string | null;
}

/**
 * Turns whatever a page caught into something a form can render.
 *
 * Server validation failures arrive as `details[].path` values prefixed with
 * the request section (`body.email`, `query.page`); everything else is a single
 * banner message driven by the stable error `code`.
 */
export function parseFormError(error: unknown): Parsed {
  if (!(error instanceof ApiError)) {
    return { fields: {}, message: error instanceof Error ? error.message : 'Something went wrong' };
  }

  if (error.code === 'VALIDATION_ERROR' && error.details.length > 0) {
    const fields: Record<string, string> = {};
    let banner: string | null = null;
    for (const detail of error.details) {
      const field = detail.path.replace(/^(body|query|params)\./, '');
      if (!(field in fields)) fields[field] = detail.message;
      // Paths that do not map onto a visible input still deserve a banner.
      if (field.includes('.')) banner = banner ?? error.message;
    }
    return { fields, message: banner };
  }

  return { fields: {}, message: error.message };
}

/** First message per field from Zod issues or API validation details. */
export function indexByPath(
  details: ReadonlyArray<{ path: string; message: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const detail of details) {
    if (!(detail.path in result)) result[detail.path] = detail.message;
  }
  return result;
}

/**
 * Message for the banner above a form: `null` when the failure is entirely
 * field-level (the fields already explain themselves), otherwise a single line.
 */
export function bannerFor(error: unknown): string | null {
  const { fields, message } = parseFormError(error);
  if (Object.keys(fields).length > 0) return null;
  return message;
}
