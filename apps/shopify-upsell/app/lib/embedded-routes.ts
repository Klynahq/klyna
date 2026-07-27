import { useLocation } from '@remix-run/react';
import { useCallback } from 'react';

export function useEmbeddedRoute() {
  const { search } = useLocation();
  return useCallback((path: string) => `${path}${search}`, [search]);
}
