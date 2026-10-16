import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@un-eosg/ui"],
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
