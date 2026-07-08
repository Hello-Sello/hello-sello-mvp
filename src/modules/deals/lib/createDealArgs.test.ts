import { describe, it, expect } from "vitest";
import { createDealRpcArgs } from "./createDealArgs";

describe("createDealRpcArgs (dealType + counterparty passthrough)", () => {
  it("defaults dealType to offer and person to null", () => {
    const a = createDealRpcArgs({ relationshipId: "r", lines: [] });
    expect(a.p_deal_type).toBe("offer");
    expect(a.p_counterparty_person_id).toBeNull();
  });

  it("passes an explicit order dealType and a chosen person", () => {
    const a = createDealRpcArgs({
      relationshipId: "r", lines: [], dealType: "order", counterpartyPersonId: "person-1",
    });
    expect(a.p_deal_type).toBe("order");
    expect(a.p_counterparty_person_id).toBe("person-1");
  });
});
