import { orderedProviders } from '@zca/providers'

/**
 * Hard constraint 2: an exhausted cap is not an error state. The status code
 * is only how the browser learns about it; the UI renders this payload as an
 * invitation to add a free key, never as a failure.
 */
export function demoExhaustedResponse(limit: number): Response {
  return Response.json(
    {
      error: {
        type: 'demo_exhausted',
        message: `You have used all ${limit} free messages for today.`,
        addYourOwnKey: orderedProviders()
          .filter((provider) => provider.models.some((model) => model.free))
          .map((provider) => ({
            providerId: provider.id,
            label: provider.label,
            signupUrl: provider.signupUrl,
          })),
      },
    },
    { status: 429 },
  )
}

export function unauthenticatedResponse(): Response {
  return Response.json(
    { error: { type: 'unauthenticated', message: 'Sign in to continue.' } },
    { status: 401 },
  )
}
