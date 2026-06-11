const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('VestingVault', function () {
  async function deployVaultFixture() {
    const [admin, manager, beneficiary, other] = await ethers.getSigners();
    const now = await time.latest();
    const presaleVestingStart = BigInt(now + 100);
    const presaleVestingDuration = 900n;

    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(admin.address, admin.address, ethers.parseEther('1000000'));
    const VestingVault = await ethers.getContractFactory('VestingVault');
    const vault = await VestingVault.deploy(
      await uki.getAddress(),
      admin.address,
      presaleVestingStart,
      presaleVestingDuration,
      presaleVestingStart
    );
    const allocationManagerRole = await vault.ALLOCATION_MANAGER_ROLE();
    const presaleVestingRole = await vault.PRESALE_VESTING_ROLE();
    await vault.grantRole(allocationManagerRole, manager.address);
    await vault.grantRole(presaleVestingRole, manager.address);
    await uki.transfer(await vault.getAddress(), ethers.parseEther('10000'));

    return { admin, manager, beneficiary, other, uki, vault, presaleVestingStart, presaleVestingDuration };
  }

  it('rejects invalid constructor arguments', async function () {
    const { admin, vault, presaleVestingStart, presaleVestingDuration } = await deployVaultFixture();
    const VestingVault = await ethers.getContractFactory('VestingVault');
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(admin.address, admin.address, ethers.parseEther('1000'));

    await expect(VestingVault.deploy(ethers.ZeroAddress, admin.address, presaleVestingStart, presaleVestingDuration, presaleVestingStart))
      .to.be.revertedWithCustomError(vault, 'InvalidToken');
    await expect(VestingVault.deploy(await uki.getAddress(), ethers.ZeroAddress, presaleVestingStart, presaleVestingDuration, presaleVestingStart))
      .to.be.revertedWithCustomError(vault, 'InvalidBeneficiary');
    await expect(VestingVault.deploy(await uki.getAddress(), admin.address, 0, presaleVestingDuration, presaleVestingStart))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(VestingVault.deploy(await uki.getAddress(), admin.address, presaleVestingStart, 0, presaleVestingStart))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(VestingVault.deploy(await uki.getAddress(), admin.address, presaleVestingStart, presaleVestingDuration, 0))
      .to.be.revertedWithCustomError(vault, 'InvalidWithdrawalUnlockTime');
  });

  it('creates and releases linear presale vesting only after vesting config freeze', async function () {
    const { manager, beneficiary, uki, vault, presaleVestingStart, presaleVestingDuration } = await deployVaultFixture();
    const amount = ethers.parseEther('900');

    await expect(vault.connect(manager).createVesting(beneficiary.address, amount))
      .to.emit(vault, 'VestingCreated')
      .withArgs(
        beneficiary.address,
        await vault.PRESALE_SCHEDULE_ID(),
        amount,
        presaleVestingStart,
        presaleVestingStart,
        presaleVestingDuration
      );

    await time.setNextBlockTimestamp(presaleVestingStart + 450n);
    await expect(vault.connect(beneficiary).release())
      .to.be.revertedWithCustomError(vault, 'NothingToRelease');

    await vault.freezePresaleVestingConfig();
    await time.increaseTo(presaleVestingStart + 452n);
    await expect(vault.connect(beneficiary).release())
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, await vault.PRESALE_SCHEDULE_ID(), ethers.parseEther('453'));
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('453'));

    await time.setNextBlockTimestamp(presaleVestingStart + presaleVestingDuration);
    await vault.connect(beneficiary).release();
    expect(await uki.balanceOf(beneficiary.address)).to.equal(amount);
  });

  it('updates the global presale vesting start for already-created schedules before freeze', async function () {
    const { admin, manager, beneficiary, vault, presaleVestingStart, presaleVestingDuration } = await deployVaultFixture();
    const nextStart = presaleVestingStart + 30n * 24n * 60n * 60n;

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await expect(vault.connect(admin).setPresaleVestingConfig(nextStart, presaleVestingDuration))
      .to.emit(vault, 'PresaleVestingConfigUpdated')
      .withArgs(nextStart, presaleVestingDuration);

    const schedule = await vault.scheduleOf(beneficiary.address);
    expect(schedule.start).to.equal((1n << 64n) - 1n);

    await vault.connect(admin).freezePresaleVestingConfig();
    const frozenSchedule = await vault.scheduleOf(beneficiary.address);
    expect(frozenSchedule.start).to.equal(nextStart);
    expect(frozenSchedule.cliff).to.equal(nextStart);
    expect(frozenSchedule.duration).to.equal(presaleVestingDuration);
  });

  it('accumulates presale schedules without per-wallet cap conflicts', async function () {
    const { manager, beneficiary, vault } = await deployVaultFixture();

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('50'));

    const schedule = await vault.scheduleOf(beneficiary.address);
    expect(schedule.totalAmount).to.equal(ethers.parseEther('150'));
  });

  it('exposes exact privileged role holders for preflight audits', async function () {
    const { admin, manager, vault } = await deployVaultFixture();
    const defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
    const presaleVestingRole = await vault.PRESALE_VESTING_ROLE();
    const allocationManagerRole = await vault.ALLOCATION_MANAGER_ROLE();

    expect(await vault.getRoleMemberCount(defaultAdminRole)).to.equal(1);
    expect(await vault.getRoleMember(defaultAdminRole, 0)).to.equal(admin.address);

    expect(await vault.getRoleMemberCount(presaleVestingRole)).to.equal(1);
    expect(await vault.getRoleMember(presaleVestingRole, 0)).to.equal(manager.address);

    expect(await vault.getRoleMemberCount(allocationManagerRole)).to.equal(1);
    expect(await vault.getRoleMember(allocationManagerRole, 0)).to.equal(manager.address);

    await vault.connect(admin).revokeRole(presaleVestingRole, manager.address);
    expect(await vault.getRoleMemberCount(presaleVestingRole)).to.equal(0);
  });

  it('separates presale vesting role from allocation manager role', async function () {
    const { admin, manager, beneficiary, other, vault, presaleVestingStart, presaleVestingDuration } =
      await deployVaultFixture();
    const presaleOnly = other;
    const allocationOnly = manager;
    const presaleId = await vault.PRESALE_SCHEDULE_ID();
    const teamId = ethers.id('TEAM');

    await vault.connect(admin).revokeRole(await vault.ALLOCATION_MANAGER_ROLE(), presaleOnly.address);
    await vault.connect(admin).grantRole(await vault.PRESALE_VESTING_ROLE(), presaleOnly.address);
    await vault.connect(admin).revokeRole(await vault.PRESALE_VESTING_ROLE(), allocationOnly.address);

    await expect(vault.connect(admin).createVesting(beneficiary.address, ethers.parseEther('1')))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');

    await expect(vault.connect(presaleOnly).createVesting(beneficiary.address, ethers.parseEther('100')))
      .to.emit(vault, 'VestingCreated')
      .withArgs(
        beneficiary.address,
        presaleId,
        ethers.parseEther('100'),
        presaleVestingStart,
        presaleVestingStart,
        presaleVestingDuration
      );

    await expect(vault.connect(presaleOnly).createVestingWithCliff(
      beneficiary.address,
      teamId,
      ethers.parseEther('100'),
      presaleVestingStart,
      presaleVestingStart,
      presaleVestingDuration
    ))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');

    await expect(vault.connect(allocationOnly).createVesting(beneficiary.address, ethers.parseEther('1')))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');

    await expect(vault.connect(allocationOnly).createVestingWithCliff(
      beneficiary.address,
      teamId,
      ethers.parseEther('300'),
      presaleVestingStart,
      presaleVestingStart + 100n,
      presaleVestingDuration
    ))
      .to.emit(vault, 'VestingCreated')
      .withArgs(
        beneficiary.address,
        teamId,
        ethers.parseEther('300'),
        presaleVestingStart,
        presaleVestingStart + 100n,
        presaleVestingDuration
      );
  });

  it('supports multiple schedule ids with cliff and releaseAll', async function () {
    const { manager, beneficiary, uki, vault, presaleVestingStart } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const presaleId = await vault.PRESALE_SCHEDULE_ID();
    const teamId = ethers.id('TEAM');
    const advisorsId = ethers.id('ADVISORS');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
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

    await vault.freezePresaleVestingConfig();
    await time.increaseTo(now + 300n);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, teamId)).to.equal(0);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, advisorsId)).to.equal(ethers.parseEther('40'));
    expect(await vault.releasable(beneficiary.address)).to.equal(
      (ethers.parseEther('100') * ((now + 300n) - presaleVestingStart)) / 900n
    );

    await vault.connect(beneficiary).releaseAll();
    expect(await uki.balanceOf(beneficiary.address)).to.be.gt(ethers.parseEther('60'));
  });

  it('starts cliff vesting accrual when the cliff ends', async function () {
    const { manager, beneficiary, vault } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const start = now + 100n;
    const cliff = start + 300n;
    const duration = 1_000n;
    const amount = ethers.parseEther('1000');
    const teamId = ethers.id('TEAM');

    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      teamId,
      amount,
      start,
      cliff,
      duration
    );

    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, start + 299n))
      .to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, cliff))
      .to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, cliff + 500n))
      .to.equal(ethers.parseEther('500'));
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, cliff + duration))
      .to.equal(amount);
  });

  it('supports cliff-only schedules that unlock fully at the cliff', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const start = now + 100n;
    const cliff = start + 40n * 24n * 60n * 60n;
    const amount = ethers.parseEther('3000');
    const ecosystem40dId = ethers.id('ECOSYSTEM_40D');

    await expect(vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      ecosystem40dId,
      amount,
      start,
      cliff,
      0
    ))
      .to.emit(vault, 'VestingCreated')
      .withArgs(beneficiary.address, ecosystem40dId, amount, start, cliff, 0);

    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, ecosystem40dId, start))
      .to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, ecosystem40dId, cliff - 1n))
      .to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, ecosystem40dId, cliff))
      .to.equal(amount);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, ecosystem40dId))
      .to.equal(0);

    await time.increaseTo(cliff);
    await expect(vault.connect(beneficiary)['release(bytes32)'](ecosystem40dId))
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, ecosystem40dId, amount);
    expect(await uki.balanceOf(beneficiary.address)).to.equal(amount);
    expect(await vault['releasable(address,bytes32)'](beneficiary.address, ecosystem40dId))
      .to.equal(0);
  });

  it('accumulates cliff-only schedules and releases them through releaseAll', async function () {
    const { manager, beneficiary, uki, vault } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const start = now + 100n;
    const cliff = start + 40n * 24n * 60n * 60n;
    const ecosystem40dId = ethers.id('ECOSYSTEM_40D');
    const advisorsId = ethers.id('ADVISORS_CLIFF_ONLY');

    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      ecosystem40dId,
      ethers.parseEther('100'),
      start,
      cliff,
      0
    );
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      ecosystem40dId,
      ethers.parseEther('50'),
      start,
      cliff,
      0
    );
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      advisorsId,
      ethers.parseEther('25'),
      start,
      cliff + 100n,
      0
    );

    expect(await vault.scheduleIdsOf(beneficiary.address)).to.deep.equal([ecosystem40dId, advisorsId]);

    await time.increaseTo(cliff);
    await vault.connect(beneficiary).releaseAll();
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('150'));

    await time.increaseTo(cliff + 100n);
    await vault.connect(beneficiary).releaseAll();
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('175'));
  });

  it('exposes presale and named schedule views and releases by schedule id', async function () {
    const { manager, beneficiary, uki, vault, presaleVestingStart } = await deployVaultFixture();
    const now = BigInt(await time.latest());
    const teamId = ethers.id('TEAM');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      teamId,
      ethers.parseEther('500'),
      now + 100n,
      now + 300n,
      1_000n
    );

    expect(await vault.releasable(beneficiary.address)).to.equal(0);
    expect(await vault.vestedAmount(beneficiary.address, presaleVestingStart - 1n)).to.equal(0);
    expect(await vault['vestedAmount(address,bytes32,uint64)'](beneficiary.address, teamId, now + 300n + 1_000n))
      .to.equal(ethers.parseEther('500'));

    const teamSchedule = await vault['scheduleOf(address,bytes32)'](beneficiary.address, teamId);
    expect(teamSchedule.totalAmount).to.equal(ethers.parseEther('500'));
    expect(teamSchedule.cliff).to.equal(now + 300n);

    await time.increaseTo(now + 800n);
    await expect(vault.connect(beneficiary)['release(bytes32)'](teamId))
      .to.emit(vault, 'TokensReleased')
      .withArgs(beneficiary.address, teamId, ethers.parseEther('250.5'));
    expect(await uki.balanceOf(beneficiary.address)).to.equal(ethers.parseEther('250.5'));
  });

  it('withdraws only unallocated UKI by admin after the withdrawal unlock time', async function () {
    const { admin, manager, beneficiary, other, uki, vault, presaleVestingStart } = await deployVaultFixture();

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await expect(vault.connect(other).withdrawUnallocated(other.address, ethers.parseEther('1')))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');

    await expect(vault.connect(admin).withdrawUnallocated(other.address, ethers.parseEther('9900')))
      .to.be.revertedWithCustomError(vault, 'UnallocatedWithdrawalLocked');

    await time.increaseTo(presaleVestingStart + 1n);
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

  it('rejects unauthorized, invalid or conflicting schedules', async function () {
    const { manager, beneficiary, other, vault } = await deployVaultFixture();
    const start = BigInt(await time.latest()) + 100n;
    const amount = ethers.parseEther('100');
    const teamId = ethers.id('TEAM');
    const maxUint64 = (1n << 64n) - 1n;

    await expect(vault.connect(other).createVesting(beneficiary.address, amount))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');
    await expect(vault.connect(other).createVestingWithCliff(beneficiary.address, teamId, amount, start, start, 900))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');
    await expect(vault.connect(manager).createVestingWithCliff(
      beneficiary.address,
      await vault.PRESALE_SCHEDULE_ID(),
      amount,
      start,
      start,
      900
    ))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(vault.connect(manager).createVesting(ethers.ZeroAddress, amount))
      .to.be.revertedWithCustomError(vault, 'InvalidBeneficiary');
    await expect(
      vault.connect(manager).createVestingWithCliff(beneficiary.address, ethers.ZeroHash, amount, start, start, 900)
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(vault.connect(manager).createVesting(beneficiary.address, 0))
      .to.be.revertedWithCustomError(vault, 'InvalidAmount');
    await expect(vault.connect(manager).createVesting(beneficiary.address, 1n << 128n))
      .to.be.revertedWithCustomError(vault, 'InvalidAmount');
    await expect(
      vault.connect(manager).createVestingWithCliff(beneficiary.address, teamId, amount, start, start - 1n, 900)
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');
    await expect(
      vault.connect(manager).createVestingWithCliff(
        beneficiary.address,
        teamId,
        amount,
        maxUint64 - 100n,
        maxUint64 - 50n,
        100
      )
    )
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');

    await vault.connect(manager).createVestingWithCliff(beneficiary.address, teamId, amount, start, start, 900);
    await expect(vault.connect(manager).createVestingWithCliff(beneficiary.address, teamId, amount, start + 1n, start + 1n, 900))
      .to.be.revertedWithCustomError(vault, 'ConflictingSchedule');
    await expect(vault.connect(manager).createVesting(other.address, ethers.parseEther('20000')))
      .to.be.revertedWithCustomError(vault, 'InsufficientUnallocatedBalance');
  });

  it('locks presale vesting config after explicit freeze', async function () {
    const { admin, manager, beneficiary, vault, presaleVestingStart, presaleVestingDuration } = await deployVaultFixture();

    await expect(vault.connect(manager).setPresaleVestingConfig(presaleVestingStart + 1n, presaleVestingDuration))
      .to.be.revertedWithCustomError(vault, 'AccessControlUnauthorizedAccount');
    await expect(vault.connect(admin).setPresaleVestingConfig(0, presaleVestingDuration))
      .to.be.revertedWithCustomError(vault, 'InvalidSchedule');

    await vault.connect(admin).freezePresaleVestingConfig();
    await expect(vault.connect(admin).freezePresaleVestingConfig())
      .to.be.revertedWithCustomError(vault, 'PresaleVestingConfigLocked');
    await expect(vault.connect(admin).setPresaleVestingConfig(presaleVestingStart + 1n, presaleVestingDuration))
      .to.be.revertedWithCustomError(vault, 'PresaleVestingConfigLocked');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await time.increaseTo(presaleVestingStart + presaleVestingDuration);
    await vault.connect(beneficiary).release();
  });

  it('rejects schedule accumulation above uint128 max with a custom error', async function () {
    const [admin, manager, beneficiary] = await ethers.getSigners();
    const maxUint128 = (1n << 128n) - 1n;
    const now = await time.latest();
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(admin.address, admin.address, maxUint128 + 10n);
    const VestingVault = await ethers.getContractFactory('VestingVault');
    const vault = await VestingVault.deploy(await uki.getAddress(), admin.address, BigInt(now + 100), 900, BigInt(now + 100));
    await vault.grantRole(await vault.PRESALE_VESTING_ROLE(), manager.address);
    await uki.transfer(await vault.getAddress(), maxUint128 + 10n);

    await vault.connect(manager).createVesting(beneficiary.address, maxUint128 - 1n);
    await expect(vault.connect(manager).createVesting(beneficiary.address, 2))
      .to.be.revertedWithCustomError(vault, 'InvalidAmount');
  });

  it('rejects releases when nothing is vested', async function () {
    const { manager, beneficiary, vault } = await deployVaultFixture();

    await expect(vault.connect(beneficiary).release())
      .to.be.revertedWithCustomError(vault, 'NothingToRelease');

    await vault.connect(manager).createVesting(beneficiary.address, ethers.parseEther('100'));
    await expect(vault.connect(beneficiary).releaseAll())
      .to.be.revertedWithCustomError(vault, 'NothingToRelease');
  });
});
