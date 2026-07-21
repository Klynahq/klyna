import { useLocation } from '@remix-run/react';

export function useEmbeddedRoute(path: string) {
  const location = useLocation();
  return `${path}${location.search}`;
}
