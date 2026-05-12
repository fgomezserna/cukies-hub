const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('VestingVault', function () {
  async function deployVaultFixture() {
    const [admin, manager, beneficiary, other] = await ethers.getSigners();
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(admin.address, admin.address, ethers.parseEther('1000000'));
    const VestingVault = await ethers.getContractFactory('VestingVault');
    const vault = await VestingVault.deploy(await uki.getAddress(), admin.address);
    const managerRole = await vault.VESTING_MANAGER_ROLE();
    await vault.grantRole(managerRole, manager.address);
    await uki.transfer(await vault.getAddress(), ethers.parseEther('10000'));

    return { admin, manager, beneficiary, other, uki, vault };
  }

  it('creates and releases linear vesting schedules', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;
    const duration = 900n;
    const amount = ethers.parseEther('900');

    await expect(vault.connect(manager).createVesting(beneficiary.address, amount, start, duration))
      .to.emit(vault, 'VestingCreated')
      .withArgs(beneficiary.address, amount, start, duration);

    await time.setNextBlockTimestamp(start + 450n);
    await expect(vault.connect(beneficiary).release())
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, ethers.parseEther('450'));
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('450'));

    await time.setNextBlockTimestamp(start + duration);
    await vault.connect(beneficiary).release();
    expect(await uki.balanceOf(beneficiary.address)).to.equal(amount);
  });

  it('accumulates schedules when start and duration match', async function () {
    const { manager, beneficiary, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;
    const duration = 900n;

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'), start, duration);
    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('50'), start, duration);

    const schedule = await vault.scheduleOf(beneficiary.address);
    expect(schedule.totalAmount).to.equal(ethers.parseEther('150'));
  });

  it('rejects unauthorized or conflicting schedules', async function () {
    const { beneficiary, other, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;

    await expect(vault.connect(other).createVesting(beneficiary.address, ethers.parseEther('100'), start, 900))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');
  });
});
