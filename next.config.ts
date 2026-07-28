import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
      : [],
  },
  // typedRoutes is off while the route map is still growing: the
  // ROUTES helpers return string, which the experimental checker rejects
  // even for routes that exist. Turn it on once the surface settles.
  experimental: { typedRoutes: false },
};

export default nextConfig;
