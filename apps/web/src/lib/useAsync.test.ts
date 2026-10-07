import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { useAsync } from './useAsync';

afterEach(cleanup);

describe('useAsync', () => {
  it('reports loading until the loader settles, then exposes the value', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('payload'), []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).toBe('payload'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('wraps a rejected loader in an ApiError rather than surfacing a raw Error', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('boom')), []));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.loading).toBe(false);
  });

  it('re-fetches when deps change while keeping the previous value visible', async () => {
    let resolveSecond!: (value: string) => void;
    const loader = vi.fn((_signal: AbortSignal, dep: number) => {
      if (dep === 1) return Promise.resolve('first');
      return new Promise<string>((resolve) => {
        resolveSecond = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useAsync((signal) => loader(signal, dep), [dep]),
      {
        initialProps: { dep: 1 },
      },
    );

    await waitFor(() => expect(result.current.data).toBe('first'));

    rerender({ dep: 2 });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('first');
    expect(loader).toHaveBeenCalledTimes(2);

    await act(() => Promise.resolve(resolveSecond('second')));
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(result.current.loading).toBe(false);
  });

  it('does not re-fetch when an inline deps array serialises to the same key', async () => {
    const loader = vi.fn(() => Promise.resolve('value'));

    const { rerender } = renderHook(() => useAsync(loader, ['stable-key']));

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    rerender();
    rerender();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reload() re-runs the loader after a mutation', async () => {
    let calls = 0;
    const loader = vi.fn(() => Promise.resolve(`call-${(calls += 1)}`));

    const { result } = renderHook(() => useAsync(loader, []));
    await waitFor(() => expect(result.current.data).toBe('call-1'));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe('call-2'));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('setData applies an optimistic value without another round-trip', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('server'), []));
    await waitFor(() => expect(result.current.data).toBe('server'));

    act(() => result.current.setData('optimistic'));

    expect(result.current.data).toBe('optimistic');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
