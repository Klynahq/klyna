import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData } from '@remix-run/react';
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { login } from '../shopify.server';

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];
export const handle = { hydrate: false };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = await login(request);
  return json({ errors });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);
  return json({ errors });
};

export default function Auth() {
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors as Record<string, string> | undefined;

  return (
    <PolarisAppProvider i18n={{}}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text as="h2" variant="headingMd">Install Klyna Capture</Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="e.g. my-shop-domain.myshopify.com"
                autoComplete="on"
                error={errors?.shop}
              />
              <Button submit>Install</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
