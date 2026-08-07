import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Migrated stock still points at the old system's blob storage, so
    // that host has to be allowed or next/image refuses every one of
    // those photos. Photos uploaded through this app come from Supabase.
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/**",
            },
          ]
        : []),
      {
        protocol: "https" as const,
        hostname: "vasyerpstorageprod.blob.core.windows.net",
        pathname: "/**",
      },
    ],
  },
  // Off while the route map is still growing: the ROUTES helpers return
  // string, which the checker rejects even for routes that exist.
  // Turn it on once the surface settles.
  typedRoutes: false,
};

export default nextConfig;
