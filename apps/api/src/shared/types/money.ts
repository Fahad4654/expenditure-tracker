import type { CurrencyCode, DecimalString } from './common';

/**
 * Money helpers.
 *
 * Amounts are handled as fixed-point decimal strings end to end. JavaScript
 * floating point is never used for arithmetic or display of money — all
 * aggregation is done in integer minor units (see `toMinorUnits`).
 */

const DECIMAL_RE = /^-?\d+(\.\d{1,2})?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value);
}

/** `"100.50"` -> `10050n`. Throws on malformed input. */
export function toMinorUnits(amount: DecimalString): bigint {
  if (!isDecimalString(amount)) {
    throw new Error(`Invalid decimal amount: ${amount}`);
  }
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -minor : minor;
}

/** `10050n` -> `"100.50"` (always exactly 2 fraction digits). */
export function fromMinorUnits(minor: bigint): DecimalString {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Normalises `"100.5"` -> `"100.50"` and `"100"` -> `"100.00"`. */
export function normalizeAmount(amount: DecimalString): DecimalString {
  return fromMinorUnits(toMinorUnits(amount));
}

export function addAmounts(a: DecimalString, b: DecimalString): DecimalString {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}

export function subtractAmounts(a: DecimalString, b: DecimalString): DecimalString {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
}

export function sumAmounts(amounts: readonly DecimalString[]): DecimalString {
  return fromMinorUnits(amounts.reduce((acc, v) => acc + toMinorUnits(v), 0n));
}

const CURRENCY_LOCALES: Record<string, string> = {
  BDT: 'en-BD',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  INR: 'en-IN',
};

type CurrencyPart = { type: string; value: string };

/**
 * Renders a decimal string for display, e.g. `formatMoney("100.50", "BDT")`
 * -> `"৳100.50"`. Built from `Intl.NumberFormat` part templates so the exact
 * decimal string is never routed through a JS `number`.
 */
export function formatMoney(
  amount: DecimalString,
  currency: CurrencyCode,
  options?: { locale?: string; showCode?: boolean },
): string {
  const locale = options?.locale ?? CURRENCY_LOCALES[currency] ?? 'en-US';
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  const template = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // `narrowSymbol` yields the bare symbol (৳, $) instead of a code/label
    // pair, which is what the UI wants.
    currencyDisplay: options?.showCode ? 'code' : 'narrowSymbol',
    // Always ASCII digits — Bengali/Arabic numerals are a presentation choice
    // the app makes elsewhere, not a data-formatting concern.
    numberingSystem: 'latn',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(0);

  const groupedWhole = new Intl.NumberFormat(locale, {
    useGrouping: true,
    numberingSystem: 'latn',
  }).format(BigInt(whole));
  const fractionDigits = fraction.padEnd(2, '0').slice(0, 2);

  let seenInteger = false;
  const rendered = template
    .map((part: CurrencyPart): string => {
      switch (part.type) {
        case 'integer': {
          if (seenInteger) return '';
          seenInteger = true;
          return groupedWhole;
        }
        case 'decimal':
          return seenInteger ? part.value : '';
        case 'fraction':
          return seenInteger ? fractionDigits : '';
        default:
          return part.value;
      }
    })
    .join('');

  return negative ? `-${rendered}` : rendered;
}
