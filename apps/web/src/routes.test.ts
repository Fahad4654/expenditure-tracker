import { describe, expect, it } from 'vitest';
import { ROUTES, transactionPath } from './routes';

describe('ROUTES', () => {
  it('exposes absolute, non-empty paths', () => {
    for (const [name, path] of Object.entries(ROUTES)) {
      expect(path, `ROUTES.${name}`).toMatch(/^\//);
    }
  });

  it('keeps detail routes under the transactions collection', () => {
    expect(ROUTES.transactions).toBe('/transactions');
    expect(ROUTES.transactionNew).toBe('/transactions/new');
    expect(ROUTES.transactionDetailPattern).toBe('/transactions/:id');
  });
});

describe('transactionPath', () => {
  it('builds the detail URL for an id', () => {
    expect(transactionPath('tx_123')).toBe('/transactions/tx_123');
  });

  it('percent-encodes ids so they cannot break out of the path segment', () => {
    expect(transactionPath('a/b')).toBe('/transactions/a%2Fb');
  });
});
