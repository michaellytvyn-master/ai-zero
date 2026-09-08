import { bearerToken, revokeExtensionToken } from '@/lib/extension-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Sign-out from inside the extension. Tokens are issued by /extension/authorize. */
export async function DELETE(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (token !== null) await revokeExtensionToken(token)
  return new Response(null, { status: 204 })
}
