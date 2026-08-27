import { describe, it, expect } from "vitest";
import {
  InMemorySiteRepository,
  siteUpsertFor,
} from "@/lib/persistence/index.js";
import { asUuid, createParcelIdentity } from "@/lib/jurisdiction/index.js";

const APN = { system: "hennepin-county-assessor", value: "0102936120150", kind: "PID" };

describe("InMemorySiteRepository", () => {
  it("keys a site by its UUID and finds it by an external APN", () => {
    const repo = new InMemorySiteRepository();
    const upsert = siteUpsertFor({
      apns: [APN],
      normalizedAddress: "300 S 4th St, Minneapolis, MN",
    });
    const saved = repo.save(upsert);

    // Primary access is by the opaque UUID.
    expect(repo.getBySiteId(saved.identity.siteId)).toEqual(saved);
    // The APN is a source-record lookup, resolving to the same site.
    const byApn = repo.findByExternalIdentifier(APN.system, APN.value);
    expect(byApn?.identity.siteId).toBe(saved.identity.siteId);
    // The APN is never the primary key.
    expect(saved.identity.siteId).not.toBe(APN.value);
  });

  it("does not confuse the same value under a different system", () => {
    const repo = new InMemorySiteRepository();
    const saved = repo.save(siteUpsertFor({ apns: [APN] }));
    expect(
      repo.findByExternalIdentifier("regrid", APN.value),
    ).toBeUndefined();
    expect(
      repo.findByExternalIdentifier(APN.system, APN.value)?.identity.siteId,
    ).toBe(saved.identity.siteId);
  });

  it("lets an APN be reassigned to a new site (lot split/merge)", () => {
    const repo = new InMemorySiteRepository();
    const first = repo.save(siteUpsertFor({ apns: [APN] }));
    // A split issues a new site (new UUID) that inherits the APN.
    const second = repo.save(siteUpsertFor({ apns: [APN] }));
    expect(second.identity.siteId).not.toBe(first.identity.siteId);
    // The index now points at the most recent owner; the old site still exists.
    expect(
      repo.findByExternalIdentifier(APN.system, APN.value)?.identity.siteId,
    ).toBe(second.identity.siteId);
    expect(repo.getBySiteId(first.identity.siteId)).toBeDefined();
    expect(repo.list()).toHaveLength(2);
  });

  it("preserves createdAt across updates and advances updatedAt", () => {
    let t = 0;
    const repo = new InMemorySiteRepository({
      now: () => new Date(1_000 + t++ * 1_000),
    });
    const identity = createParcelIdentity({ apns: [APN], providerIds: [] });
    const first = repo.save({ identity });
    const second = repo.save({ identity, normalizedAddress: "later address" });
    expect(second.identity.siteId).toBe(first.identity.siteId);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect(repo.list()).toHaveLength(1); // same UUID -> update, not insert
  });

  it("finds sites by (non-unique) address and mints valid UUIDs", () => {
    const repo = new InMemorySiteRepository();
    repo.save(siteUpsertFor({ normalizedAddress: "1 Main St" }));
    repo.save(siteUpsertFor({ normalizedAddress: "1 Main St" }));
    expect(repo.findByAddress("1 Main St")).toHaveLength(2);
    // The minted identity is a valid PARCELGRID UUID.
    for (const r of repo.list()) {
      expect(() => asUuid(r.identity.siteId)).not.toThrow();
    }
  });
});
