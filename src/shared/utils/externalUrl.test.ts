import { describe, it, expect } from "vitest";
import { externalUrl } from "./externalUrl";

describe("externalUrl", () => {
  it.each([
    ["www.canadiancraftco.ca", "https://www.canadiancraftco.ca"],
    ["canadiancraftco.ca/shop", "https://canadiancraftco.ca/shop"],
    ["  www.example.com  ", "https://www.example.com"],
    ["linkedin.com/in/some-one", "https://linkedin.com/in/some-one"],
    ["https://example.com", "https://example.com"],
    ["HTTP://example.com/a?b=1", "HTTP://example.com/a?b=1"],
  ])("%s → %s", (input, expected) => {
    expect(externalUrl(input)).toBe(expected);
  });

  it.each(["", "   ", null, undefined, "javascript:alert(1)", "mailto:a@b.co", "not a url", "localhost", "https://"])(
    "refuses %s",
    (input) => {
      expect(externalUrl(input)).toBeNull();
    },
  );
});
