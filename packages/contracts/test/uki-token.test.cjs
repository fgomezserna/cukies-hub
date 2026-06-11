const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('UKIToken', function () {
  async function deployTokenFixture() {
    const [owner, treasury, user] = await ethers.getSigners();
    const initialSupply = ethers.parseEther('1000000000');
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(owner.address, treasury.address, initialSupply);
    return { owner, treasury, user, initialSupply, uki };
  }

  it('mints fixed initial supply to the receiver', async function () {
    const { treasury, initialSupply, uki } = await deployTokenFixture();

    expect(await uki.name()).to.equal('Cukies UKI');
    expect(await uki.symbol()).to.equal('UKI');
    expect(await uki.decimals()).to.equal(18);
    expect(await uki.totalSupply()).to.equal(initialSupply);
    expect(await uki.balanceOf(treasury.address)).to.equal(initialSupply);
  });

  it('rejects invalid constructor addresses', async function () {
    const { owner, treasury, uki, initialSupply } = await deployTokenFixture();
    const UKIToken = await ethers.getContractFactory('UKIToken');

    await expect(UKIToken.deploy(ethers.ZeroAddress, treasury.address, initialSupply))
      .to.be.revertedWithCustomError(uki, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
    await expect(UKIToken.deploy(owner.address, ethers.ZeroAddress, initialSupply))
      .to.be.revertedWithCustomError(uki, 'InvalidSupplyReceiver');
  });

  it('supports transfers, allowance and burn', async function () {
    const { treasury, user, uki } = await deployTokenFixture();

    await expect(uki.connect(treasury).transfer(user.address, ethers.parseEther('100')))
      .to.changeTokenBalances(uki, [treasury, user], [-ethers.parseEther('100'), ethers.parseEther('100')]);

    await uki.connect(user).approve(treasury.address, ethers.parseEther('40'));
    expect(await uki.allowance(user.address, treasury.address)).to.equal(ethers.parseEther('40'));

    await uki.connect(user).burn(ethers.parseEther('10'));
    expect(await uki.balanceOf(user.address)).to.equal(ethers.parseEther('90'));
  });

  it('pauses transfers by owner only', async function () {
    const { owner, treasury, user, uki } = await deployTokenFixture();

    await expect(uki.connect(user).pause()).to.be.revertedWithCustomError(uki, 'OwnableUnauthorizedAccount');

    await uki.connect(owner).pause();
    await expect(uki.connect(treasury).transfer(user.address, ethers.parseEther('1')))
      .to.be.revertedWithCustomError(uki, 'EnforcedPause');
    await expect(uki.connect(user).unpause()).to.be.revertedWithCustomError(uki, 'OwnableUnauthorizedAccount');

    await uki.connect(owner).unpause();
    await expect(uki.connect(treasury).transfer(user.address, ethers.parseEther('1')))
      .to.changeTokenBalances(uki, [treasury, user], [-ethers.parseEther('1'), ethers.parseEther('1')]);
  });

  it('does not allow ownership renounce to strand pause recovery', async function () {
    const { owner, uki } = await deployTokenFixture();

    await expect(uki.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(uki, 'OwnershipRenounceDisabled');
    expect(await uki.owner()).to.equal(owner.address);
  });
});
