import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable reactCompiler unless the required Babel plugin is installed.
  experimental: {
    // reactCompiler: true,
  },
};

export default nextConfig;
