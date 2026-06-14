import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide Next's dev-tools button entirely. It collided with both the account
  // avatar (bottom-left of the rail) and the Agentation feedback toolbar
  // (bottom-right, no position setting of its own), and Next 16 no longer honours
  // a `position` for it. We don't need it during the UI pass; flip back to
  // `{ position: "bottom-right" }` if the build/route indicator is wanted again.
  // Dev-only; has no effect in production.
  devIndicators: false,
};

export default nextConfig;
