import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
