import { nextHeaders } from '../../config/securityHeaders.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: nextHeaders('admin'),
  // Workspace packages ship TypeScript source (AD-01); Next compiles them in place.
  transpilePackages: ['@cvip/ui', '@cvip/types'],
};

export default nextConfig;
