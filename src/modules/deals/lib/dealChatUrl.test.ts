import { describe, it, expect } from "vitest";
import { dealChatUrl } from "./dealChatUrl";

// Locks the URL contract Task 8a (basket popover) and Task 8c (chat's
// "Create Deal" button) will both call after createDeal(). ChatView.tsx's
// query-param effect reads back exactly these two param names
// (`relationship`, `deal`) - a silent rename on either side would break the
// "land in the chat with the new card open" flow without a compile error.
describe("dealChatUrl (Task 8b's chat deep-link contract)", () => {
  it("builds /connect/chat with the relationship and deal query params", () => {
    expect(dealChatUrl("rel-1", "deal-1")).toBe(
      "/connect/chat?relationship=rel-1&deal=deal-1",
    );
  });

  it("keeps relationship before deal, matching ChatView's read order", () => {
    const url = dealChatUrl("rel-2", "deal-2");
    const [path, query] = url.split("?");
    expect(path).toBe("/connect/chat");
    const params = new URLSearchParams(query);
    expect(params.get("relationship")).toBe("rel-2");
    expect(params.get("deal")).toBe("deal-2");
  });
});
