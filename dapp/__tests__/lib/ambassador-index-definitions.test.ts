import {
  AMBASSADOR_ECONOMY_COLLECTIONS,
  AMBASSADOR_ECONOMY_INDEX_DEFINITIONS,
} from "@/lib/uki-economy/ambassadors/index-definitions";

describe("ambassador economy index definitions", () => {
  it("mantiene una sola atribucion canonica por wallet referida", () => {
    expect(AMBASSADOR_ECONOMY_COLLECTIONS).toEqual([
      "ambassador_attributions",
      "ambassador_graph_state",
      "ambassador_profiles",
    ]);
    expect(AMBASSADOR_ECONOMY_INDEX_DEFINITIONS).toContainEqual({
      collection: "ambassador_attributions",
      keys: { referredWalletNormalized: 1 },
      options: { unique: true, name: "ambassador_referred_wallet_unique" },
    });
  });

  it("impide reutilizar wallets o codigos de invitacion", () => {
    expect(AMBASSADOR_ECONOMY_INDEX_DEFINITIONS).toEqual(expect.arrayContaining([
      {
        collection: "ambassador_profiles",
        keys: { walletNormalized: 1 },
        options: { unique: true, name: "ambassador_profile_wallet_unique" },
      },
      {
        collection: "ambassador_profiles",
        keys: { invitationCode: 1 },
        options: { unique: true, name: "ambassador_invitation_code_unique" },
      },
    ]));
  });

  it("precrea el estado que serializa las escrituras del grafo", () => {
    expect(AMBASSADOR_ECONOMY_INDEX_DEFINITIONS).toContainEqual({
      collection: "ambassador_graph_state",
      keys: { updatedAt: -1 },
      options: { name: "ambassador_graph_state_updated" },
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
