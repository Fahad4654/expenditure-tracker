import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  formatMoney,
  fromMinorUnits,
  isDecimalString,
  normalizeAmount,
  subtractAmounts,
  sumAmounts,
  toMinorUnits,
} from '../src/money';

describe('minor unit conversion', () => {
  it('converts decimal strings to integer minor units', () => {
    expect(toMinorUnits('100.50')).toBe(10050n);
    expect(toMinorUnits('0.01')).toBe(1n);
    expect(toMinorUnits('100')).toBe(10000n);
    expect(toMinorUnits('100.5')).toBe(10050n);
  });

  it('round-trips back to a normalised 2-dp string', () => {
    expect(fromMinorUnits(10050n)).toBe('100.50');
    expect(fromMinorUnits(1n)).toBe('0.01');
    expect(fromMinorUnits(0n)).toBe('0.00');
  });

  it('rejects malformed amounts', () => {
    expect(() => toMinorUnits('abc')).toThrow();
    expect(() => toMinorUnits('1.234')).toThrow();
    expect(() => toMinorUnits('')).toThrow();
    expect(isDecimalString('12.34')).toBe(true);
    expect(isDecimalString('12.345')).toBe(false);
    expect(isDecimalString('12.')).toBe(false);
    // Negatives are legal *internally* — a balance can be below zero.
    expect(isDecimalString('-5')).toBe(true);
  });

  it('is exact far beyond IEEE-754 safe integers', () => {
    // 90,071,992,547,409.93 — would lose precision if done with `number`.
    const big = '90071992547409.93';
    expect(addAmounts(big, '0.07')).toBe('90071992547410.00');
    expect(subtractAmounts('90071992547410.00', '0.01')).toBe('90071992547409.99');
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and sums exactly', () => {
    expect(addAmounts('0.10', '0.20')).toBe('0.30');
    expect(subtractAmounts('1.00', '0.99')).toBe('0.01');
    expect(sumAmounts(['1.10', '2.20', '3.30'])).toBe('6.60');
    expect(sumAmounts([])).toBe('0.00');
  });

  it('normalises to two decimal places', () => {
    expect(normalizeAmount('5')).toBe('5.00');
    expect(normalizeAmount('5.1')).toBe('5.10');
    expect(normalizeAmount('5.15')).toBe('5.15');
  });

  it('supports negative balances (income minus expense can go either way)', () => {
    expect(subtractAmounts('10.00', '25.50')).toBe('-15.50');
    expect(toMinorUnits('-15.50')).toBe(-1550n);
    expect(fromMinorUnits(-1550n)).toBe('-15.50');
  });
});

describe('formatMoney', () => {
  it('renders BDT with the taka symbol', () => {
    expect(formatMoney('100.50', 'BDT')).toContain('100.50');
    expect(formatMoney('100.50', 'BDT')).toContain('৳');
    expect(formatMoney('0.00', 'BDT')).toContain('0.00');
  });

  it('groups large values without going through a float', () => {
    const rendered = formatMoney('1234567890.99', 'BDT');
    expect(rendered).toContain('1,234,567,890.99');
    expect(rendered).toContain('৳');
  });

  it('renders negatives', () => {
    expect(formatMoney('-15.50', 'USD')).toContain('15.50');
    expect(formatMoney('-15.50', 'USD').trim().startsWith('-')).toBe(true);
  });
});
