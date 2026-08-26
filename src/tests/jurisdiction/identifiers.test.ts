import { describe, it, expect } from "vitest";
import {
  asUuid,
  createParcelIdentity,
  findIdentifier,
  newUuid,
} from "@/lib/jurisdiction/identifiers.js";

describe("identifiers", () => {
  it("mints and validates PARCELGRID UUIDs", () => {
    const id = newUuid();
    expect(() => asUuid(id)).not.toThrow();
  });

  it("rejects an APN as an internal id", () => {
    expect(() => asUuid("1132010500102810023")).toThrow();
    expect(() => asUuid("13-029-24-32-0045")).toThrow();
  });

  it("carries APNs and provider ids as source records beside the UUID", () => {
    const identity = createParcelIdentity({
      apns: [
        { system: "hennepin-county-assessor", value: "13-029-24-32-0045", kind: "PID" },
      ],
      providerIds: [{ system: "regrid", value: "abc-123" }],
      normalizedAddress: "3300 Aldrich Ave S, Minneapolis, MN 55408",
    });
    expect(() => asUuid(identity.siteId)).not.toThrow();
    expect(findIdentifier(identity, "regrid")?.value).toBe("abc-123");
    expect(findIdentifier(identity, "hennepin-county-assessor")?.kind).toBe("PID");
    expect(findIdentifier(identity, "attom")).toBeUndefined();
  });
});
