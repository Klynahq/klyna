import { useCallback, useEffect, useRef, useState } from 'react';

interface ShopifyAppBridge {
  idToken: () => Promise<string>;
}

interface AuthenticatedActionResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  submit: (action: string, routeId: string, formData: FormData) => Promise<T | null>;
}

const RETRY_HEADER = 'X-Shopify-Retry-Invalid-Session-Request';

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error) return error;
  }

  return `Request failed (${status}). Please try again.`;
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Unexpected response (${response.status}). Please reload the app and try again.`,
    );
  }
  return response.json();
}

export function useAuthenticatedAction<T>(): AuthenticatedActionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const submit = useCallback(
    async (action: string, routeId: string, formData: FormData): Promise<T | null> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setData(null);
      setError(null);

      try {
        const shopify = (window as Window & { shopify?: ShopifyAppBridge }).shopify;
        if (!shopify)
          throw new Error('Shopify authentication is not ready. Please reload the app.');

        const send = async () => {
          const token = await shopify.idToken();
          const actionUrl = new URL(action, window.location.origin);
          actionUrl.searchParams.set('_data', routeId);
          return fetch(actionUrl, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: formData,
            signal: controller.signal,
          });
        };

        let response = await send();
        if (response.status === 401 && response.headers.get(RETRY_HEADER) === '1') {
          response = await send();
        }
        const payload = await parseJson(response);

        if (!response.ok) throw new Error(errorMessage(payload, response.status));

        setData(payload as T);
        return payload as T;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return null;
        setError(cause instanceof Error ? cause.message : 'Request failed. Please try again.');
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [],
  );

  return { data, error, loading, submit };
}
