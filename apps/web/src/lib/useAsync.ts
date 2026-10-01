import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from './api';

type Status = 'loading' | 'success' | 'error';

interface State<T> {
  status: Status;
  data: T | null;
  error: ApiError | null;
}

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  /** True while a load is in flight. Previous data is kept visible meanwhile. */
  loading: boolean;
  /** Re-run the loader — call after a mutation so the view reflects it. */
  reload: () => void;
  /** Replace the loaded value locally (optimistic updates). */
  setData: (next: T) => void;
}

/**
 * Data loader with cancellation, stale-while-reloading semantics and a
 * `reload()` for post-mutation refreshes.
 *
 * `deps` are serialised rather than compared by identity: pages naturally build
 * filter objects inline, and a stable JSON key means an unchanged filter does
 * not re-fetch on every render. The loader is read from a ref, so callers never
 * have to memoise it.
 *
 * State is only ever touched from render or from async callbacks — never
 * synchronously inside the effect — which keeps React's effect rules happy and
 * avoids a render cascade on every filter change.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): AsyncState<T> {
  const [state, setState] = useState<State<T>>({ status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const [depKey, setDepKey] = useState(() => JSON.stringify(deps));

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const nextKey = JSON.stringify(deps);
  if (nextKey !== depKey) {
    // React's documented "adjust state during render" pattern: re-key and flip
    // back to loading in one pass so the effect below can stay side-effect free
    // until the promise settles. Existing data is retained for stale renders.
    setDepKey(nextKey);
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void loaderRef.current(controller.signal).then(
      (data) => {
        if (active) setState({ status: 'success', data, error: null });
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', data: null, error: toApiError(error) });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [depKey, nonce]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    setNonce((value) => value + 1);
  }, []);

  const setData = useCallback(
    (next: T) => setState({ status: 'success', data: next, error: null }),
    [],
  );

  return { ...state, loading: state.status === 'loading', reload, setData };
}

/** Never surface a raw `Error` to the UI — everything is an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return new ApiError('INTERNAL_ERROR', message);
}
