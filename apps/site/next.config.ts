import type { NextConfig } from 'next';

// Security headers (CSP and the rest) are set by the host at the first deploy, as for the console.
const config: NextConfig = {
  poweredByHeader: false,
  // The design system ships TypeScript sources (packages/ui).
  transpilePackages: ['@vertex-shifa/ui'],
};

export default config;
