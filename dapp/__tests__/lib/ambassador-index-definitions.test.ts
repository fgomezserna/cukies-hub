import {
  AMBASSADOR_ECONOMY_COLLECTIONS,
  AMBASSADOR_ECONOMY_INDEX_DEFINITIONS,
} from "@/lib/uki-economy/ambassadors/index-definitions";

describe("ambassador economy index definitions", () => {
  it("mantiene una sola atribucion canonica por wallet referida", () => {
    expect(AMBASSADOR_ECONOMY_COLLECTIONS).toEqual(["ambassador_attributions"]);
    expect(AMBASSADOR_ECONOMY_INDEX_DEFINITIONS).toContainEqual({
      collection: "ambassador_attributions",
      keys: { referredWalletNormalized: 1 },
      options: { unique: true, name: "ambassador_referred_wallet_unique" },
    });
  });

  it("permite auditar invitados directos y la politica capturada", () => {
    expect(AMBASSADOR_ECONOMY_INDEX_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        keys: { ambassadorWalletNormalized: 1, acceptedAt: -1, _id: 1 },
      }),
      expect.objectContaining({
        keys: { source: 1, policyVersion: 1, acceptedAt: -1 },
      }),
    ]));
  });
});
