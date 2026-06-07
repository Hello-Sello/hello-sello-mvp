import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Move Next's dev-tools indicator off the bottom-left so it stops overlapping
  // our user-photo slot in the rail. Dev-only; has no effect in production.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
