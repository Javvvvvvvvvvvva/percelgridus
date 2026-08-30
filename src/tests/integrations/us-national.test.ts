import { describe, it, expect } from "vitest";
import { createUsNationalProviders } from "@/lib/integrations/us-national/index.js";
import { CensusAddressProvider } from "@/lib/integrations/us-census/index.js";
import { FemaFloodProvider } from "@/lib/integrations/us-fema/index.js";
import { UsgsTerrainProvider } from "@/lib/integrations/us-usgs/index.js";
import { isEvidence } from "@/lib/jurisdiction/index.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/index.js";

describe("createUsNationalProviders", () => {
  it("bundles the address provider and the flood + terrain hazard providers", () => {
    const national = createUsNationalProviders();
    expect(national.addressProvider).toBeInstanceOf(CensusAddressProvider);
    expect(national.hazardProviders).toHaveLength(2);
    const flood = national.hazardProviders.find((h) => h.hazardKind === "flood");
    const terrain = national.hazardProviders.find(
      (h) => h.hazardKind === "terrain",
    );
    expect(flood).toBeInstanceOf(FemaFloodProvider);
    expect(terrain).toBeInstanceOf(UsgsTerrainProvider);
  });

  it("threads per-provider config through to each provider", async () => {
    // Inject a canned FEMA fetch and confirm the bundle's flood provider uses it.
    const national = createUsNationalProviders({
      fema: {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            features: [{ attributes: { FLD_ZONE: "AE", SFHA_TF: "T" } }],
          }),
        }),
      },
    });
    const flood = national.hazardProviders.find((h) => h.hazardKind === "flood");
    const square: PolygonCoordinates = [
      [
        [-93.29, 44.94],
        [-93.28, 44.94],
        [-93.28, 44.95],
        [-93.29, 44.95],
        [-93.29, 44.94],
      ],
    ];
    const result = await flood!.flood!(square);
    if (!isEvidence(result)) throw new Error("expected a flood evidence");
    expect(result.value.femaZone).toBe("AE");
    expect(result.value.inSfha).toBe(true);
  });
});
