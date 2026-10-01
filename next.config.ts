import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  outputFileTracingIncludes: { '/*': ['./supabase/migrations/**/*.sql'] },
};

export default nextConfig;
