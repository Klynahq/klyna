// Pure formatting utilities that may be imported from BOTH server and client
// modules. Keep this file dependency-free (no Prisma, no fetch, no env).
//
// If you need a server-only helper, put it in *.server.ts instead.

/**
 * Format minor units (cents) to a display string.
 * The storefront passes its own currency symbol; the admin defaults to `$`.
 */
export function formatMoney(minor: number, symbol = '$'): string {
  return `${symbol}${(minor / 100).toFixed(2)}`;
}
