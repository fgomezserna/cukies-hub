const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('CukiePoolNftVault accelerated testnet calendar', function () {
  it('rejects unsupported durations and never permits fast cycles outside chain 97', async function () {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('CukiePoolNftVault');
    for (const duration of [0, 60, 1799, 7200]) {
      await expect(Factory.deploy(owner.address, duration)).to.be.revertedWithCustomError(Factory, 'InvalidPeriodDuration');
    }
    const chainId = (await ethers.provider.getNetwork()).chainId;
    for (const duration of [1800, 3600]) {
      if (chainId !== 97n) {
        await expect(Factory.deploy(owner.address, duration)).to.be.revertedWithCustomError(Factory, 'InvalidPeriodDuration');
      } else {
        const vault = await Factory.deploy(owner.address, duration);
        expect(await vault.PERIOD_DURATION()).to.equal(duration);
      }
    }
  });

  it('activates, exits and withdraws at exact 30-minute boundaries with stable bytecode', async function () {
    if ((await ethers.provider.getNetwork()).chainId !== 97n) this.skip();
    const [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('CukiePoolNftVault');
    const vault = await Factory.deploy(owner.address, 1800);
    const daily = await Factory.deploy(owner.address, 86400);
    expect(await ethers.provider.getCode(await vault.getAddress()))
      .to.equal(await ethers.provider.getCode(await daily.getAddress()));
    const nft = await (await ethers.getContractFactory('MockERC721')).deploy('Cukies', 'CUKI');
    const collection = await nft.getAddress();
    await vault.setCollectionAllowed(collection, true);
    await nft.mint(alice.address, 901);
    await nft.connect(alice).approve(await vault.getAddress(), 901);
    const cutoff = (BigInt(await time.latest()) / 1800n + 1n) * 1800n;
    await time.setNextBlockTimestamp(cutoff - 1n);
    await vault.connect(alice).deposit(collection, 901);
    expect((await vault.positionOf(collection, 901)).activationAt).to.equal(cutoff);
    expect(await vault.isLendable(collection, 901)).to.equal(false);
    await time.increaseTo(cutoff);
    expect(await vault.isLendable(collection, 901)).to.equal(true);
    const first = await vault.periodAt(cutoff);
    const weekLater = await vault.periodAt(cutoff + 7n * 1800n);
    expect(weekLater.periodId - first.periodId).to.equal(7);
    await vault.connect(alice).requestExit(collection, 901);
    expect((await vault.positionOf(collection, 901)).withdrawableAt).to.equal(cutoff + 1800n);
    await expect(vault.connect(alice).withdraw(collection, 901)).to.be.revertedWithCustomError(vault, 'WithdrawalNotReady');
    await time.setNextBlockTimestamp(cutoff + 1800n);
    await vault.connect(alice).withdraw(collection, 901);
    expect(await nft.ownerOf(901)).to.equal(alice.address);
  });
});
