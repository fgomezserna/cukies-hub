const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Staging NFT source', function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const Nft = await ethers.getContractFactory('StagingCukiesNft');
    const nft = await Nft.deploy(owner.address);
    const Marketplace = await ethers.getContractFactory('StagingCukiesMarketplaceSource');
    const marketplace = await Marketplace.deploy(owner.address);
    const Bridge = await ethers.getContractFactory('StagingCukiesBridgeSource');
    const bridge = await Bridge.deploy(owner.address);
    return { owner, other, nft, marketplace, bridge };
  }

  it('mints the six stable rarity values with original generation metadata', async function () {
    const { owner, nft } = await deployFixture();
    for (let rarity = 1; rarity <= 6; rarity += 1) {
      const tokenId = 97_000_000 + rarity;
      await expect(nft.mint(owner.address, tokenId, rarity, 1))
        .to.emit(nft, 'Transfer')
        .withArgs(ethers.ZeroAddress, owner.address, tokenId)
        .and.to.emit(nft, 'CukieMetadataConfigured')
        .withArgs(tokenId, rarity, 1);
      expect(await nft.ownerOf(tokenId)).to.equal(owner.address);
      expect(await nft.cukieMetadata(tokenId)).to.deep.equal([BigInt(rarity), 1n]);
    }
  });

  it('rejects invalid metadata and non-owner fixture mutations', async function () {
    const { owner, other, nft, marketplace, bridge } = await deployFixture();
    await expect(nft.mint(owner.address, 1, 0, 1)).to.be.revertedWith(
      'StagingCukiesNft: invalid rarity',
    );
    await expect(nft.mint(owner.address, 1, 1, 3)).to.be.revertedWith(
      'StagingCukiesNft: invalid generation',
    );
    await expect(nft.connect(other).mint(other.address, 1, 1, 1))
      .to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    await expect(marketplace.connect(other).emitMarketTokenSaleCancelled(1))
      .to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
    await expect(bridge.connect(other).emitJumpOutBridge(1, other.address, 1))
      .to.be.revertedWithCustomError(bridge, 'OwnableUnauthorizedAccount');
  });

  it('keeps the historical marketplace and bridge event signatures', async function () {
    const { owner, marketplace, bridge } = await deployFixture();
    await expect(marketplace.emitTokenOnSale(1, owner.address, 100, 5, 10))
      .to.emit(marketplace, 'TokenOnSale')
      .withArgs(1, owner.address, 100, 5, 10);
    await expect(marketplace.emitTokenBought(1, owner.address, 11))
      .to.emit(marketplace, 'TokenBought')
      .withArgs(1, owner.address, 11);
    await expect(marketplace.emitMarketTokenSaleCancelled(1))
      .to.emit(marketplace, 'MarketTokenSaleCancelled')
      .withArgs(1);
    await expect(marketplace.emitMarketTokenPriceChanged(1, 200, 7))
      .to.emit(marketplace, 'MarketTokenPriceChanged')
      .withArgs(1, 200, 7);
    await expect(bridge.emitJumpInBridge(1, owner.address, owner.address, 2, 12))
      .to.emit(bridge, 'JumpInBridge')
      .withArgs(1, owner.address, owner.address, 2, 12);
    await expect(bridge.emitJumpOutBridge(1, owner.address, 13))
      .to.emit(bridge, 'JumpOutBridge')
      .withArgs(1, owner.address, 13);
  });
});
