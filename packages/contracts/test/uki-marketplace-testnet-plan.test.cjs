const { expect } = require("chai");
const {
  BSC_TESTNET_CHAIN_ID,
  MAX_FEE_BPS,
  PANCAKE_V2_TESTNET_ROUTER,
  TESTNET_UKI_TOKEN,
  TESTNET_WBNB,
  buildUkiMarketplaceTestnetPlan,
} = require("../scripts/lib/uki-marketplace-testnet-plan.cjs");

const fixture = {
  UKI_MARKETPLACE_DEPLOYER_ADDRESS:
    "0x1111111111111111111111111111111111111111",
  UKI_MARKETPLACE_OWNER: "0x2222222222222222222222222222222222222222",
  UKI_MARKETPLACE_FEE_RECIPIENT: "0x3333333333333333333333333333333333333333",
  UKI_MARKETPLACE_COLLECTION_ADDRESS:
    "0x4444444444444444444444444444444444444444",
  UKI_MARKETPLACE_FEE_BPS: "137",
  UKI_MARKETPLACE_DEPLOYMENT_CONFIRM: "BSC_TESTNET_97_MARKETPLACE_FEE_137",
};

describe("UKI marketplace BSC Testnet deployment plan", function () {
  it("pins chain 97 and every previously verified immutable dependency", function () {
    const plan = buildUkiMarketplaceTestnetPlan(fixture);

    expect(plan).to.deep.include({
      chainId: BSC_TESTNET_CHAIN_ID,
      ukiToken: TESTNET_UKI_TOKEN,
      router: PANCAKE_V2_TESTNET_ROUTER,
      wrappedNative: TESTNET_WBNB,
      feeBps: 137,
    });
    expect(plan.collection).to.equal(
      fixture.UKI_MARKETPLACE_COLLECTION_ADDRESS
    );
  });

  it("requires the confirmation to bind the exact approved fee", function () {
    expect(() =>
      buildUkiMarketplaceTestnetPlan({
        ...fixture,
        UKI_MARKETPLACE_DEPLOYMENT_CONFIRM:
          "BSC_TESTNET_97_MARKETPLACE_FEE_138",
      })
    ).to.throw("must be exactly BSC_TESTNET_97_MARKETPLACE_FEE_137");
  });

  it("accepts both allowed fee boundaries only with their exact confirmation", function () {
    for (const feeBps of [0, MAX_FEE_BPS]) {
      const plan = buildUkiMarketplaceTestnetPlan({
        ...fixture,
        UKI_MARKETPLACE_FEE_BPS: String(feeBps),
        UKI_MARKETPLACE_DEPLOYMENT_CONFIRM: `BSC_TESTNET_97_MARKETPLACE_FEE_${feeBps}`,
      });
      expect(plan.feeBps).to.equal(feeBps);
    }
  });

  it("rejects malformed, fractional, negative and excessive fee values", function () {
    for (const feeBps of ["", "1.5", "-1", String(MAX_FEE_BPS + 1)]) {
      expect(() =>
        buildUkiMarketplaceTestnetPlan({
          ...fixture,
          UKI_MARKETPLACE_FEE_BPS: feeBps,
          UKI_MARKETPLACE_DEPLOYMENT_CONFIRM: `BSC_TESTNET_97_MARKETPLACE_FEE_${feeBps}`,
        })
      ).to.throw("UKI_MARKETPLACE_FEE_BPS");
    }
  });

  it("refuses a fresh deployment when any marketplace address already exists", function () {
    for (const name of [
      "UKI_MARKETPLACE_ADDRESS",
      "NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS",
      "CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS",
    ]) {
      expect(() =>
        buildUkiMarketplaceTestnetPlan({
          ...fixture,
          [name]: "0x5555555555555555555555555555555555555555",
        })
      ).to.throw(`existing address env detected (${name})`);
    }
  });

  it("rejects zero, malformed and dependency-reused collection addresses", function () {
    for (const collection of [
      "0x0",
      "0x0000000000000000000000000000000000000000",
    ]) {
      expect(() =>
        buildUkiMarketplaceTestnetPlan({
          ...fixture,
          UKI_MARKETPLACE_COLLECTION_ADDRESS: collection,
        })
      ).to.throw("valid non-zero address");
    }
    expect(() =>
      buildUkiMarketplaceTestnetPlan({
        ...fixture,
        UKI_MARKETPLACE_COLLECTION_ADDRESS: TESTNET_UKI_TOKEN,
      })
    ).to.throw("must be distinct");
  });
});
