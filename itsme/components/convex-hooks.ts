import { useQueries, useQuery, usePaginatedQuery } from "convex/react";
import { useRef, useState, useCallback } from "react";
import { makeUseQueryWithStatus } from "convex-helpers/react";

export const useQueryWithStatus = makeUseQueryWithStatus(useQueries);

export type UseConvexMutationStateOptions<R> = {
  /**
   * Called after a successful mutation with the server return value.
   */
  onSuccess?: (data: R) => void;
};

export type UseConvexActionStateOptions<R> = {
  /**
   * Called after a successful action with the server return value.
   */
  onSuccess?: (data: R) => void;
};

/**
 * Wraps the callable returned by `useMutation(api.some.mutation)` with
 * pending / error / success / data state and an optional `onSuccess` callback.
 */
export function useConvexMutationState<
  R,
  Mutate extends (...args: never[]) => Promise<R>,
>(mutate: Mutate, options?: UseConvexMutationStateOptions<R>) {
  type Data = R;

  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [data, setData] = useState<Data | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handle = useCallback(
    async (...args: Parameters<Mutate>): Promise<R | undefined> => {
      setError(null);
      setIsSuccess(false);
      setIsPending(true);
      try {
        const result = await mutate(...args);
        setData(result);
        setIsSuccess(true);
        optionsRef.current?.onSuccess?.(result);
        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : String(err ?? "Request failed")
        );
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [mutate]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsSuccess(false);
    setIsPending(false);
    setData(null);
  }, []);

  return {
    handle,
    error,
    setError,
    isSuccess,
    isPending,
    /** Last successful mutation result; also updatable via `setData`. */
    data,
    setData,
    reset,
  };
}

/**
 * Wraps the callable returned by `useAction(api.some.action)` with
 * pending / error / success / data state and an optional `onSuccess` callback.
 */
export function useConvexActionState<
  Act extends (...args: never[]) => Promise<unknown>,
>(
  action: Act,
  options?: UseConvexActionStateOptions<Awaited<ReturnType<Act>>>
) {
  type Data = Awaited<ReturnType<Act>>;

  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [data, setData] = useState<Data | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handle = useCallback(
    async (...args: Parameters<Act>): Promise<Data | undefined> => {
      setError(null);
      setIsSuccess(false);
      setIsPending(true);
      try {
        const result = (await action(...args)) as Data;
        setData(result);
        setIsSuccess(true);
        optionsRef.current?.onSuccess?.(result);
        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : String(err ?? "Request failed")
        );
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [action]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsSuccess(false);
    setIsPending(false);
    setData(null);
  }, []);

  return {
    handle,
    error,
    setError,
    isSuccess,
    isPending,
    /** Last successful action result; also updatable via `setData`. */
    data,
    setData,
    reset,
  };
}

/**
 * Drop-in replacement for useQuery intended to be used with a parametrized query.
 * Unlike useQuery, useStableQuery does not return undefined while loading new
 * data when the query arguments change, but instead will continue to return
 * the previously loaded data until the new data has finished loading.
 *
 * See https://stack.convex.dev/help-my-app-is-overreacting for details.
 *
 * @param name - string naming the query function
 * @param ...args - arguments to be passed to the query function
 * @returns UseQueryResult
 */
export const useStableQuery = ((name, ...args) => {
  const result = useQuery(name, ...args);
  const stored = useRef(result); // ref objects are stable between rerenders

  // result is only undefined while data is loading
  // if a freshly loaded result is available, use the ref to store it
  if (result !== undefined) {
    stored.current = result;
  }

  // undefined on first load, stale data while loading, fresh data after loading
  return stored.current;
}) as typeof useQuery;

/**
 * Drop-in replacement for usePaginatedQuery for use with a parametrized query.
 * Unlike usePaginatedQuery, when query arguments change useStablePaginatedQuery
 * does not return empty results and 'LoadingMore' status. Instead, it continues
 * to return the previously loaded results until the new results have finished
 * loading.
 *
 * See https://stack.convex.dev/help-my-app-is-overreacting for details.
 *
 * @param name - string naming the query function
 * @param ...args - arguments to be passed to the query function
 * @returns UsePaginatedQueryResult
 */
export const useStablePaginatedQuery = ((name, ...args) => {
  const result = usePaginatedQuery(name, ...args);
  const stored = useRef(result); // ref objects are stable between rerenders

  // If data is still loading, wait and do nothing
  // If data has finished loading, store the result
  if (result.status !== "LoadingMore" && result.status !== "LoadingFirstPage") {
    stored.current = result;
  }

  return stored.current;
}) as typeof usePaginatedQuery;

export const useStableQueryWithStatus = ((name, ...args) => {
  const result = useQueryWithStatus(name, ...args);
  const storedData = useRef(result.data);
  const storedError = useRef(result.error);

  if (result.status === "success") {
    storedData.current = result.data;
    storedError.current = undefined;
  } else if (result.status === "error") {
    storedError.current = result.error;
  }

  return {
    ...result,
    data: storedData.current,
    error: storedError.current,
  };
}) as typeof useQueryWithStatus;
