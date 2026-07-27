import type { ActionFunctionArgs } from '@remix-run/node';
import { action as handleShopRedact } from './webhooks.shop.redact';

export const action = (args: ActionFunctionArgs) => {
  if (!args.request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  return handleShopRedact(args);
};
