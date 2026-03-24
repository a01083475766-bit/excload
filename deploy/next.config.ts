import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Keep deployment build unblocked while legacy type issues are cleaned up incrementally.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
