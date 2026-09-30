import { normalizeAmount } from '@exp/types';
import type { DecimalString } from '@exp/types';

/**
 * Money never leaves the API as a JS number.
 *
 * Prisma returns `Prisma.Decimal` for `Decimal(18,2)` columns; JSON.stringify
 * would turn it into a number and lose precision above 2^53. These helpers are
 * the only sanctioned conversion points.
 */

export interface DecimalLike {
  toString(): string;
}

export function toDecimalString(value: DecimalLike | string): DecimalString {
  return normalizeAmount(typeof value === 'string' ? value : value.toString());
}

/** Sums an array of stored decimals in integer minor units — never in floats. */
export function sumDecimalStrings(values: readonly DecimalLike[]): DecimalString {
  let minor = 0n;
  for (const value of values) {
    const normalized = normalizeAmount(value.toString());
    // Split the sign off first: `BigInt('-1') * 100n + 25n` is -75, not -125.
    const negative = normalized.startsWith('-');
    const [whole = '0', fraction = ''] = (negative ? normalized.slice(1) : normalized).split('.');
    const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    minor += negative ? -magnitude : magnitude;
  }
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${abs / 100n}.${fraction}`;
}

/**
 * Aggregates raw `SUM(amount)` results coming back from `$queryRaw`.
 * PostgreSQL may return a string, a number or a `Prisma.Decimal`.
 */
export function sumFromAggregate(value: unknown): DecimalString {
  if (value === null || value === undefined) return '0.00';
  if (typeof value === 'number') {
    // Raw aggregation of DECIMAL comes back as string in pg; a number only
    // happens for integer-ish inputs. Route it through the string path so no
    // float arithmetic is ever performed.
    return normalizeAmount(value.toFixed(2));
  }
  return normalizeAmount(String(value));
}
