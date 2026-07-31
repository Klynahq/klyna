import prisma from '../db.server';

const RETRY_HEADER = 'X-Shopify-Retry-Invalid-Session-Request';

export async function withAdminSessionRecovery<T>(
  session: { id: string },
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (!(cause instanceof Response) || (cause.status !== 401 && cause.status !== 403)) {
      throw cause;
    }

    await prisma.session.deleteMany({ where: { id: session.id } });
    throw new Response(
      JSON.stringify({
        error: 'Shopify refreshed this app connection. Please try the action again.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          [RETRY_HEADER]: '1',
        },
      },
    );
  }
}
