// Writes a captured contact to Shopify customers with email/SMS marketing
// consent, via the Admin GraphQL API. Called from the public capture endpoint
// after a successful opt-in.
//
// We use `customerCreate` with `emailMarketingConsent` / `smsMarketingConsent`
// so the contact lands in the merchant's marketing audience immediately. If a
// customer with that email already exists, Shopify returns a "taken" error,
// which we treat as a soft success (the contact is already on the list).

interface AdminGraphqlClient {
  (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

export interface SyncInput {
  email?: string | null;
  phone?: string | null;
  emailConsent: boolean;
  smsConsent: boolean;
}

export interface SyncResult {
  state: 'synced' | 'error';
  customerId?: string;
  error?: string;
}

const CUSTOMER_CREATE = `#graphql
  mutation KlynaCaptureCustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
        phone
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function consentBlock(subscribed: boolean) {
  return {
    marketingState: subscribed ? 'SUBSCRIBED' : 'NOT_SUBSCRIBED',
    marketingOptInLevel: 'SINGLE_OPT_IN',
    consentUpdatedAt: new Date().toISOString(),
  };
}

export async function syncSubscriberToShopify(
  admin: { graphql: AdminGraphqlClient },
  input: SyncInput,
): Promise<SyncResult> {
  const customerInput: Record<string, unknown> = {};
  if (input.email) {
    customerInput.email = input.email;
    customerInput.emailMarketingConsent = consentBlock(input.emailConsent);
  }
  if (input.phone) {
    customerInput.phone = input.phone;
    if (input.smsConsent) {
      customerInput.smsMarketingConsent = {
        marketingState: 'SUBSCRIBED',
        marketingOptInLevel: 'SINGLE_OPT_IN',
        consentUpdatedAt: new Date().toISOString(),
      };
    }
  }

  try {
    const response = await admin.graphql(CUSTOMER_CREATE, {
      variables: { input: customerInput },
    });
    const body = (await response.json()) as {
      data?: {
        customerCreate?: {
          customer?: { id: string } | null;
          userErrors?: Array<{ field?: string[] | null; message: string }>;
        };
      };
    };

    const result = body.data?.customerCreate;
    const userErrors = result?.userErrors ?? [];

    if (result?.customer?.id) {
      return { state: 'synced', customerId: result.customer.id };
    }

    // "Email has already been taken" — the contact is already a customer.
    // Treat as a non-fatal sync: the opt-in still counts as a conversion.
    const taken = userErrors.find((e) => /taken|already/i.test(e.message));
    if (taken) {
      return { state: 'synced' };
    }

    if (userErrors.length > 0) {
      return { state: 'error', error: userErrors.map((e) => e.message).join('; ') };
    }

    return { state: 'error', error: 'Unknown customerCreate failure' };
  } catch (err) {
    return {
      state: 'error',
      error: err instanceof Error ? err.message : 'GraphQL request failed',
    };
  }
}
