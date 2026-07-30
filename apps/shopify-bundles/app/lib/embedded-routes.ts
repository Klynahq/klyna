const route = (path: string) => path;

export function useEmbeddedRoute() {
  // App Bridge adds a fresh session token to same-origin Remix requests.
  // Persisting the launch query would reuse its short-lived id_token.
  return route;
}
