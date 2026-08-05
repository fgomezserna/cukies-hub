const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('UKIStaking', function () {
  async function deployStakingFixture() {
    const [owner, alice, bob, other] = await ethers.getSigners();
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(owner.address, owner.address, ethers.parseEther('1000'));
    const UKIStaking = await ethers.getContractFactory('UKIStaking');
    const staking = await UKIStaking.deploy(await uki.getAddress(), owner.address);

    await uki.transfer(alice.address, ethers.parseEther('300'));
    await uki.transfer(bob.address, ethers.parseEther('200'));

    return { owner, alice, bob, other, uki, staking, UKIStaking };
  }

  it('tracks deposits from multiple wallets and preserves the total invariant', async function () {
    const { alice, bob, uki, staking } = await deployStakingFixture();
    const aliceAmount = ethers.parseEther('120');
    const bobAmount = ethers.parseEther('75');

    await uki.connect(alice).approve(await staking.getAddress(), aliceAmount);
    await uki.connect(bob).approve(await staking.getAddress(), bobAmount);

    await expect(staking.connect(alice).stake(aliceAmount))
      .to.emit(staking, 'Staked')
      .withArgs(alice.address, aliceAmount, aliceAmount, aliceAmount);
    await expect(staking.connect(bob).stake(bobAmount))
      .to.emit(staking, 'Staked')
      .withArgs(bob.address, bobAmount, bobAmount, aliceAmount + bobAmount);

    expect(await staking.stakedBalance(alice.address)).to.equal(aliceAmount);
    expect(await staking.stakedBalance(bob.address)).to.equal(bobAmount);
    expect(await staking.totalStaked()).to.equal(aliceAmount + bobAmount);
    expect(await uki.balanceOf(await staking.getAddress())).to.equal(aliceAmount + bobAmount);
  });

  it('supports partial and complete withdrawals with effects reflected in every event', async function () {
    const { alice, uki, staking } = await deployStakingFixture();
    const amount = ethers.parseEther('100');
    await uki.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);

    await expect(staking.connect(alice).unstake(ethers.parseEther('40')))
      .to.emit(staking, 'Unstaked')
      .withArgs(alice.address, ethers.parseEther('40'), ethers.parseEther('60'), ethers.parseEther('60'));
    await expect(staking.connect(alice).unstake(ethers.parseEther('60')))
      .to.emit(staking, 'Unstaked')
      .withArgs(alice.address, ethers.parseEther('60'), 0, 0);

    expect(await staking.stakedBalance(alice.address)).to.equal(0);
    expect(await staking.totalStaked()).to.equal(0);
    expect(await uki.balanceOf(alice.address)).to.equal(ethers.parseEther('300'));
  });

  it('rejects zero amounts and withdrawals above the wallet stake', async function () {
    const { alice, uki, staking } = await deployStakingFixture();

    await expect(staking.connect(alice).stake(0))
      .to.be.revertedWithCustomError(staking, 'InvalidAmount');
    await expect(staking.connect(alice).unstake(0))
      .to.be.revertedWithCustomError(staking, 'InvalidAmount');

    await uki.connect(alice).approve(await staking.getAddress(), ethers.parseEther('10'));
    await staking.connect(alice).stake(ethers.parseEther('10'));
    await expect(staking.connect(alice).unstake(ethers.parseEther('10.000000000000000001')))
      .to.be.revertedWithCustomError(staking, 'InsufficientStakedBalance');
  });

  it('bubbles insufficient allowance and balance errors without changing accounting', async function () {
    const { alice, uki, staking } = await deployStakingFixture();

    await expect(staking.connect(alice).stake(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(uki, 'ERC20InsufficientAllowance');

    await uki.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
    await expect(staking.connect(alice).stake(ethers.parseEther('301')))
      .to.be.revertedWithCustomError(uki, 'ERC20InsufficientBalance');

    expect(await staking.stakedBalance(alice.address)).to.equal(0);
    expect(await staking.totalStaked()).to.equal(0);
  });

  it('blocks new stakes while paused but always permits users to unstake', async function () {
    const { owner, alice, bob, uki, staking } = await deployStakingFixture();
    const amount = ethers.parseEther('50');
    await uki.connect(alice).approve(await staking.getAddress(), amount);
    await uki.connect(bob).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);

    await staking.connect(owner).pause();
    await expect(staking.connect(bob).stake(amount))
      .to.be.revertedWithCustomError(staking, 'EnforcedPause');
    await expect(staking.connect(alice).unstake(amount))
      .to.emit(staking, 'Unstaked')
      .withArgs(alice.address, amount, 0, 0);

    await staking.connect(owner).unpause();
    await expect(staking.connect(bob).stake(amount)).to.emit(staking, 'Staked');
  });

  it('transfers ownership in two steps without giving the pending owner early control', async function () {
    const { owner, alice, other, staking } = await deployStakingFixture();

    await expect(staking.connect(owner).transferOwnership(alice.address))
      .to.emit(staking, 'OwnershipTransferStarted')
      .withArgs(owner.address, alice.address);
    expect(await staking.owner()).to.equal(owner.address);
    expect(await staking.pendingOwner()).to.equal(alice.address);

    await expect(staking.connect(other).acceptOwnership())
      .to.be.revertedWithCustomError(staking, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(staking.connect(alice).pause())
      .to.be.revertedWithCustomError(staking, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(staking.connect(owner).pause()).to.emit(staking, 'Paused').withArgs(owner.address);

    await expect(staking.connect(alice).acceptOwnership())
      .to.emit(staking, 'OwnershipTransferred')
      .withArgs(owner.address, alice.address);
    expect(await staking.owner()).to.equal(alice.address);
    expect(await staking.pendingOwner()).to.equal(ethers.ZeroAddress);

    await expect(staking.connect(owner).unpause())
      .to.be.revertedWithCustomError(staking, 'OwnableUnauthorizedAccount')
      .withArgs(owner.address);
    await expect(staking.connect(alice).unpause()).to.emit(staking, 'Unpaused').withArgs(alice.address);
  });

  it('restricts pause controls to the owner and disables ownership renunciation', async function () {
    const { owner, other, staking } = await deployStakingFixture();

    await expect(staking.connect(other).pause())
      .to.be.revertedWithCustomError(staking, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(staking.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(staking, 'OwnershipRenounceDisabled');
    expect(await staking.owner()).to.equal(owner.address);
  });

  it('rejects invalid constructor addresses', async function () {
    const { owner, staking, UKIStaking } = await deployStakingFixture();

    await expect(UKIStaking.deploy(ethers.ZeroAddress, owner.address))
      .to.be.revertedWithCustomError(staking, 'InvalidToken');
    await expect(UKIStaking.deploy(await staking.ukiToken(), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(staking, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
  });
});
