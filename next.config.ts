import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide Next's dev-tools button entirely. It collided with both the account
  // avatar (bottom-left of the rail) and the Agentation feedback toolbar
  // (bottom-right, no position setting of its own), and Next 16 no longer honours
  // a `position` for it. We don't need it during the UI pass; flip back to
  // `{ position: "bottom-right" }` if the build/route indicator is wanted again.
  // Dev-only; has no effect in production.
  devIndicators: false,

  // Old→new permanent 301s (SET-01, D-04). The settings home absorbs /account and
  // /team, so their deep links must keep resolving. Redirects run BEFORE routing —
  // the AUTH gate stays the proxy's job (`/settings/*` is gated-by-default, no
  // allowlist entry), and the PATH move is next.config's job, NOT the proxy (B7
  // lock). `permanent: true` = 301 so browsers/crawlers cache the new home.
  async redirects() {
    return [
      { source: "/account", destination: "/settings/profile", permanent: true },
      { source: "/team", destination: "/settings/organization/team", permanent: true },
    ];
  },
};

export default nextConfig;
