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

  it('rejects invalid constructor arguments', async function () {
    const { admin, vault } = await deployVaultFixture();
    const VestingVault = await ethers.getContractFactory('VestingVault');
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(admin.address, admin.address, ethers.parseEther('1000'));

    await expect(VestingVault.deploy(ethers.ZeroAddress, admin.address))
      .to.be.revertedWithCustomError(vault, 'InvalidToken');
    await expect(VestingVault.deploy(await uki.getAddress(), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(vault, 'InvalidBeneficiary');
  });

  it('creates and releases linear vesting schedules', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;
    const duration = 900n;
    const amount = ethers.parseEther('900');

    await expect(vault.connect(manager).createVesting(beneficiary.address, amount, start, duration))
      .to.emit(vault, 'VestingCreated')
      .withArgs(beneficiary.address, await vault.PRESALE_SCHEDULE_ID(), amount, start, start, duration);

    await time.setNextBlockTimestamp(start + 450n);
    await expect(vault.connect(beneficiary).release())
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, await vault.PRESALE_SCHEDULE_ID(), ethers.parseEther('450'));
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

  it('supports multiple schedule ids with cliff and releaseAll', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const presaleId = await vault.PRESALE_SCHEDULE_ID();
    const teamId = ethers.id('TEAM');
    const advisorsId = ethers.id('ADVISORS');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'), now + 100n, 1_000n);
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      teamId,
      ethers.parseEther('300'),
      now + 100n,
      now + 400n,
      1_000n
    );
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      advisorsId,
      ethers.parseEther('200'),
      now + 100n,
      now + 100n,
      1_000n
    );

    expect(await vault.scheduleIdsOf(beneficiary.address)).to.deep.equal([presaleId, teamId, advisorsId]);

    await time.increaseTo(now + 300n);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, teamId)).to.equal(0);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, advisorsId)).to.equal(ethers.parseEther('40'));

    await vault.connect(beneficiary).releaseAll();
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('60.3'));
  });

  it('exposes presale and named schedule views and releases by schedule id', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const start = now + 100n;
    const duration = 1_000n;
    const teamId = ethers.id('TEAM');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'), start, duration);
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      teamId,
      ethers.parseEther('500'),
      start,
      start + 200n,
      duration
    );

    expect(await vault.releasable(beneficiary.address)).to.equal(0);
    expect(await vault.vestedAmount(beneficiary.address, start - 1n)).to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, start + duration)).to.equal(
      ethers.parseEther('500')
    );

    const teamSchedule = await vault['scheduleOf(address,bytes32)'](beneficiary.address, teamId);
    expect(teamSchedule.totalAmount).to.equal(ethers.parseEther('500'));
    expect(teamSchedule.cliff).to.equal(start + 200n);

    await time.increaseTo(start + 600n);
    await expect(vault.connect(beneficiary)['release(bytes32)'](teamId))
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, teamId, ethers.parseEther('300.5'));
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('300.5'));
  });

  it('withdraws only unallocated UKI by admin', async function () {
    const { admin, manager, beneficiary, other, uki, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'), start, 900);
    await expect(vault.connect(other).withdrawUnallocated(other.address, ethers.parseEther('1')))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');

    await vault.connect(admin).withdrawUnallocated(other.address, ethers.parseEther('9900'));
    expect(await uki.balanceOf(other.address)).to.equal(ethers.parseEther('9900'));
    await expect(vault.connect(admin).withdrawUnallocated(other.address, 1))
      .to.be.revertedWithCustomError(vault, 'InsufficientUnallocatedBalance');
  });

  it('rejects invalid unallocated withdrawals', async function () {
    const { admin, vault } = await deployVaultFixture();

    await expect(vault.connect(admin).withdrawUnallocated(ethers.ZeroAddress, 1))
      .to.be.revertedWithCustomError(vault, 'InvalidRecipient');
    await expect(vault.connect(admin).withdrawUnallocated(admin.address, 0))
      .to.be.revertedWithCustomError(vault, 'InvalidAmount');
  });

  it('rejects unauthorized or conflicting schedules', async function () {
    const { manager, beneficiary, other, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;
    const amount = ethers.parseEther('100');
    const teamId = ethers.id('TEAM');

    await expect(vault.connect(other).createVesting(beneficiary.address, amount, start, 900))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');
    await expect(vault.connect(manager).createVesting(ethers.ZeroAddress, amount, start, 900))
      .to.be.revertedWithCustomError(vault, 'InvalidBeneficiary');
    await expect(
      vault.connect(manager).createVestingWithCliff(beneficiary.address, ethers.ZeroHash, amount, start, start, 900)
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(vault.connect(manager).createVesting(beneficiary.address, 0, start, 900))
      .to.be.revertedWithCustomError(vault, 'InvalidAmount');
    await expect(vault.connect(manager).createVesting(beneficiary.address, amount, 0, 900))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(vault.connect(manager).createVesting(beneficiary.address, amount, start, 0))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(
      vault.connect(manager).createVestingWithCliff(beneficiary.address, teamId, amount, start, start - 1n, 900)
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(
      vault.connect(manager).createVestingWithCliff(beneficiary.address, teamId, amount, start, start + 901n, 900)
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');

    await vault.connect(manager).createVesting(beneficiary.address, amount, start, 900);
    await expect(vault.connect(manager).createVesting(beneficiary.address, amount, start + 1n, 900))
      .to.be.revertedWithCustomError(vault, 'ConflictingSchedule');
    await expect(vault.connect(manager).createVesting(other.address, ethers.parseEther('20000'), start, 900))
      .to.be.revertedWithCustomError(vault, 'InsufficientUnallocatedBalance');
  });

  it('rejects releases when nothing is vested', async function () {
    const { manager, beneficiary, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;

    await expect(vault.connect(beneficiary).release())
      .to.be.revertedWithCustomError(vault, 'NothingToRelease');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'), start, 900);
    await expect(vault.connect(beneficiary).releaseAll())
      .to.be.revertedWithCustomError(vault, 'NothingToRelease');
  });
});
