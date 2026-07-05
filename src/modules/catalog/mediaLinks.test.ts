/**
 * RED-first unit contract for the video-link host allowlist (Phase 7, 07-03).
 * A pasted embed URL is untrusted input that the 07-04 card renders into an
 * `<iframe src>` — so only a fixed set of embed hosts (YouTube/Vimeo/Loom) over
 * https may pass, and dangerous schemes (`javascript:`, `data:`) must be rejected.
 * Pure functions, no Supabase, no React.
 *
 * RED until mediaLinks.ts exists (the import fails to resolve). This test drives
 * the validator's shape — do NOT create the module to satisfy an unrelated gate.
 */
import { describe, it, expect } from "vitest";
import { isAllowedVideoUrl, normalizeVideoUrl } from "./mediaLinks";

describe("isAllowedVideoUrl — embed-host allowlist (T-07-07)", () => {
  it("accepts https URLs on the allowed hosts", () => {
    expect(isAllowedVideoUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isAllowedVideoUrl("https://youtube.com/embed/abc123")).toBe(true);
    expect(isAllowedVideoUrl("https://youtu.be/abc123")).toBe(true);
    expect(isAllowedVideoUrl("https://vimeo.com/123456789")).toBe(true);
    expect(isAllowedVideoUrl("https://player.vimeo.com/video/123456789")).toBe(true);
    expect(isAllowedVideoUrl("https://www.loom.com/share/deadbeef")).toBe(true);
    expect(isAllowedVideoUrl("https://loom.com/embed/deadbeef")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isAllowedVideoUrl("  https://youtu.be/abc123  ")).toBe(true);
  });

  it("rejects any non-allowlisted host", () => {
    expect(isAllowedVideoUrl("https://evil.com/embed/x")).toBe(false);
    expect(isAllowedVideoUrl("https://example.org/video")).toBe(false);
    // A look-alike host must not pass on a substring match.
    expect(isAllowedVideoUrl("https://youtube.com.evil.com/x")).toBe(false);
    expect(isAllowedVideoUrl("https://notyoutube.com/x")).toBe(false);
    expect(isAllowedVideoUrl("https://evil.com/youtube.com")).toBe(false);
  });

  it("rejects non-https schemes on an allowed host", () => {
    expect(isAllowedVideoUrl("http://youtube.com/watch?v=abc")).toBe(false);
    expect(isAllowedVideoUrl("ftp://vimeo.com/123")).toBe(false);
  });

  it("rejects dangerous schemes", () => {
    expect(isAllowedVideoUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedVideoUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isAllowedVideoUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("rejects malformed / empty input", () => {
    expect(isAllowedVideoUrl("")).toBe(false);
    expect(isAllowedVideoUrl("   ")).toBe(false);
    expect(isAllowedVideoUrl("not a url")).toBe(false);
    expect(isAllowedVideoUrl("://youtube.com")).toBe(false);
  });
});

describe("normalizeVideoUrl — canonical https URL or null", () => {
  it("returns the trimmed canonical URL for an allowed host", () => {
    expect(normalizeVideoUrl("  https://youtu.be/abc123  ")).toBe("https://youtu.be/abc123");
    expect(normalizeVideoUrl("https://vimeo.com/123456789")).toBe("https://vimeo.com/123456789");
  });

  it("returns null for a rejected URL", () => {
    expect(normalizeVideoUrl("https://evil.com/x")).toBeNull();
    expect(normalizeVideoUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeVideoUrl("")).toBeNull();
  });
});
