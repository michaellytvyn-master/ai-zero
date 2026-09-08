import type { NextConfig } from 'next'

const config: NextConfig = {
  // Workspace packages ship TypeScript sources rather than a build step.
  transpilePackages: ['@zca/shared', '@zca/providers', '@zca/router-core'],
  serverExternalPackages: ['pg'],
}

export default config
