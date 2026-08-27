const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('LiquidityLocker', function () {
  async function deployLockerFixture() {
    const [deployer, beneficiary, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const lpToken = await MockERC20.deploy('Pancake LPs', 'Cake-LP');
    const latest = BigInt(await time.latest());
    const unlockTime = latest + 3_600n;
    const LiquidityLocker = await ethers.getContractFactory('LiquidityLocker');
    const locker = await LiquidityLocker.deploy(
      await lpToken.getAddress(),
      beneficiary.address,
      unlockTime,
    );

    return { deployer, beneficiary, other, lpToken, locker, LiquidityLocker, unlockTime };
  }

  it('binds the LP token, immutable beneficiary and one-shot unlock timestamp', async function () {
    const { beneficiary, lpToken, locker, unlockTime } = await deployLockerFixture();

    expect(await locker.lpToken()).to.equal(await lpToken.getAddress());
    expect(await locker.owner()).to.equal(beneficiary.address);
    expect(await locker.unlockTime()).to.equal(unlockTime);
    expect(await locker.start()).to.equal(unlockTime);
    expect(await locker.end()).to.equal(unlockTime);
    expect(await locker.duration()).to.equal(0);
  });

  it('holds all deposited LP tokens and rejects every early release path', async function () {
    const { deployer, beneficiary, other, lpToken, locker, unlockTime } = await deployLockerFixture();
    const amount = ethers.parseEther('25');
    await lpToken.mint(deployer.address, amount);
    await lpToken.transfer(await locker.getAddress(), amount);

    expect(await locker.lockedLiquidity()).to.equal(amount);
    expect(await locker.releasableLiquidity()).to.equal(0);

    await expect(locker.connect(other).releaseLiquidity())
      .to.be.revertedWithCustomError(locker, 'LiquidityStillLocked');
    await expect(locker.connect(other)['release(address)'](await lpToken.getAddress()))
      .to.be.revertedWithCustomError(locker, 'LiquidityStillLocked');

    expect(await lpToken.balanceOf(beneficiary.address)).to.equal(0);
    expect(await lpToken.balanceOf(await locker.getAddress())).to.equal(amount);
  });

  it('allows anyone to release the complete LP balance only to the beneficiary at maturity', async function () {
    const { deployer, beneficiary, other, lpToken, locker, unlockTime } = await deployLockerFixture();
    const amount = ethers.parseEther('25');
    await lpToken.mint(deployer.address, amount);
    await lpToken.transfer(await locker.getAddress(), amount);
    await time.setNextBlockTimestamp(unlockTime);

    await expect(locker.connect(other).releaseLiquidity())
      .to.emit(locker, 'ERC20Released')
      .withArgs(await lpToken.getAddress(), amount)
      .and.to.emit(locker, 'LiquidityReleased')
      .withArgs(other.address, beneficiary.address, amount);

    expect(await lpToken.balanceOf(beneficiary.address)).to.equal(amount);
    expect(await locker.lockedLiquidity()).to.equal(0);
    expect(await locker['released(address)'](await lpToken.getAddress())).to.equal(amount);
    await expect(locker.releaseLiquidity())
      .to.be.revertedWithCustomError(locker, 'NoLiquidityToRelease');
  });

  it('locks LP tokens transferred after deployment under the same timestamp', async function () {
    const { deployer, beneficiary, lpToken, locker, unlockTime } = await deployLockerFixture();
    const firstAmount = ethers.parseEther('10');
    const secondAmount = ethers.parseEther('15');
    await lpToken.mint(deployer.address, firstAmount + secondAmount);
    await lpToken.transfer(await locker.getAddress(), firstAmount);
    await time.increaseTo(unlockTime - 10n);
    await lpToken.transfer(await locker.getAddress(), secondAmount);

    expect(await locker.releasableLiquidity()).to.equal(0);
    await time.setNextBlockTimestamp(unlockTime);
    await locker.releaseLiquidity();
    expect(await lpToken.balanceOf(beneficiary.address)).to.equal(firstAmount + secondAmount);
  });

  it('prevents changing or destroying the beneficiary', async function () {
    const { beneficiary, other, locker } = await deployLockerFixture();

    await expect(locker.connect(beneficiary).transferOwnership(other.address))
      .to.be.revertedWithCustomError(locker, 'BeneficiaryChangeDisabled');
    await expect(locker.connect(beneficiary).renounceOwnership())
      .to.be.revertedWithCustomError(locker, 'BeneficiaryChangeDisabled');
    expect(await locker.owner()).to.equal(beneficiary.address);
  });

  it('rejects a missing LP token, missing beneficiary and non-future unlock time', async function () {
    const { beneficiary, lpToken, locker, LiquidityLocker } = await deployLockerFixture();
    const latest = BigInt(await time.latest());

    await expect(LiquidityLocker.deploy(ethers.ZeroAddress, beneficiary.address, latest + 100n))
      .to.be.revertedWithCustomError(locker, 'InvalidLpToken');
    await expect(LiquidityLocker.deploy(await lpToken.getAddress(), ethers.ZeroAddress, latest + 100n))
      .to.be.revertedWithCustomError(locker, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
    await expect(LiquidityLocker.deploy(await lpToken.getAddress(), beneficiary.address, latest))
      .to.be.revertedWithCustomError(locker, 'UnlockTimeNotFuture');
  });
});

describe('SixMonthLiquidityLocker', function () {
  it('derives an immutable 180-day unlock from the deployment block', async function () {
    const [, beneficiary] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const lpToken = await MockERC20.deploy('Pancake LPs', 'Cake-LP');
    const Locker = await ethers.getContractFactory('SixMonthLiquidityLocker');
    const locker = await Locker.deploy(await lpToken.getAddress(), beneficiary.address);
    const receipt = await locker.deploymentTransaction().wait();
    const deploymentBlock = await ethers.provider.getBlock(receipt.blockNumber);
    const duration = 180n * 24n * 60n * 60n;

    expect(await locker.LOCK_DURATION()).to.equal(duration);
    expect(await locker.unlockTime()).to.equal(BigInt(deploymentBlock.timestamp) + duration);
    expect(await locker.start()).to.equal(await locker.unlockTime());
    expect(await locker.owner()).to.equal(beneficiary.address);
    expect(await locker.lpToken()).to.equal(await lpToken.getAddress());
  });
});
