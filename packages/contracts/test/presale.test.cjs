const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Presale', function () {
  async function deployPresaleFixture() {
    const [owner, treasury, buyer, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const asm = await MockERC20.deploy('ApeSwap', 'ASM');

    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(owner.address, owner.address, ethers.parseEther('100000000'));

    const VestingVault = await ethers.getContractFactory('VestingVault');
    const vault = await VestingVault.deploy(await uki.getAddress(), owner.address);
    await uki.transfer(await vault.getAddress(), ethers.parseEther('10000000'));

    const now = await time.latest();
    const saleStart = BigInt(now + 100);
    const saleEnd = saleStart + 30n * 24n * 60n * 60n;
    const vestingStart = saleStart + 60n * 60n;
    const vestingDuration = 9n * 30n * 24n * 60n * 60n;

    const Presale = await ethers.getContractFactory('Presale');
    const presale = await Presale.deploy({
      owner: owner.address,
      asmToken: await asm.getAddress(),
      vestingVault: await vault.getAddress(),
      treasury: treasury.address,
      saleStart,
      saleEnd,
      ukiPerAsm: ethers.parseEther('100'),
      minAsmPerPurchase: ethers.parseEther('1'),
      maxAsmPerPurchase: ethers.parseEther('10000'),
      walletAsmCap: ethers.parseEther('20000'),
      totalUkiForSale: ethers.parseEther('10000000'),
      vestingStart,
      vestingDuration,
    });

    await vault.grantRole(await vault.VESTING_MANAGER_ROLE(), await presale.getAddress());
    await asm.mint(buyer.address, ethers.parseEther('50000'));
    await asm.connect(buyer).approve(await presale.getAddress(), ethers.MaxUint256);

    return { owner, treasury, buyer, other, asm, uki, vault, presale, saleStart, saleEnd, vestingStart, vestingDuration };
  }

  it('sells UKI with ASM and creates buyer vesting', async function () {
    const { treasury, buyer, asm, vault, presale, saleStart, vestingStart, vestingDuration } = await deployPresaleFixture();
    await time.setNextBlockTimestamp(saleStart);

    const asmAmount = ethers.parseEther('100');
    const ukiAmount = ethers.parseEther('10000');
    await expect(presale.connect(buyer).buy(asmAmount))
      .to.emit(presale, 'Purchased')
      .withArgs(buyer.address, asmAmount, ukiAmount, asmAmount, ukiAmount);

    expect(await asm.balanceOf(treasury.address)).to.equal(asmAmount);
    expect(await presale.asmPurchased(buyer.address)).to.equal(asmAmount);
    expect(await presale.ukiPurchased(buyer.address)).to.equal(ukiAmount);

    const schedule = await vault.scheduleOf(buyer.address);
    expect(schedule.totalAmount).to.equal(ukiAmount);
    expect(schedule.start).to.equal(vestingStart);
    expect(schedule.cliff).to.equal(vestingStart);
    expect(schedule.duration).to.equal(vestingDuration);
    expect(await vault.scheduleIdsOf(buyer.address)).to.deep.equal([await vault.PRESALE_SCHEDULE_ID()]);
  });

  it('allows multiple purchases in the same vesting schedule', async function () {
    const { buyer, vault, presale, saleStart } = await deployPresaleFixture();
    await time.setNextBlockTimestamp(saleStart);

    await presale.connect(buyer).buy(ethers.parseEther('10'));
    await presale.connect(buyer).buy(ethers.parseEther('15'));

    expect(await presale.asmPurchased(buyer.address)).to.equal(ethers.parseEther('25'));
    const schedule = await vault.scheduleOf(buyer.address);
    expect(schedule.totalAmount).to.equal(ethers.parseEther('2500'));
  });

  it('reverts outside window, below min, above max and over wallet cap', async function () {
    const { buyer, presale, saleStart, saleEnd } = await deployPresaleFixture();

    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(presale, 'SaleNotOpen');

    await time.setNextBlockTimestamp(saleStart);
    await expect(presale.connect(buyer).buy(ethers.parseEther('0.5')))
      .to.be.revertedWithCustomError(presale, 'PurchaseTooSmall');

    await expect(presale.connect(buyer).buy(ethers.parseEther('10001')))
      .to.be.revertedWithCustomError(presale, 'PurchaseTooLarge');

    await presale.connect(buyer).buy(ethers.parseEther('10000'));
    await presale.connect(buyer).buy(ethers.parseEther('10000'));
    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(presale, 'WalletCapExceeded');

    await time.setNextBlockTimestamp(saleEnd + 1n);
    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(presale, 'SaleNotOpen');
  });

  it('reverts when the global UKI sale cap is exceeded', async function () {
    const { buyer, asm, presale, saleStart } = await deployPresaleFixture();
    await time.setNextBlockTimestamp(saleStart);

    await presale.setPurchaseLimits(
      ethers.parseEther('1'),
      ethers.parseEther('1000000'),
      ethers.parseEther('1000000')
    );

    await asm.mint(buyer.address, ethers.parseEther('100000'));
    await presale.connect(buyer).buy(ethers.parseEther('100000'));
    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
  });

  it('blocks buys while paused', async function () {
    const { owner, buyer, presale, saleStart } = await deployPresaleFixture();
    await time.setNextBlockTimestamp(saleStart);

    await presale.connect(owner).pause();
    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.be.revertedWithCustomError(presale, 'EnforcedPause');

    await presale.connect(owner).unpause();
    await expect(presale.connect(buyer).buy(ethers.parseEther('1')))
      .to.emit(presale, 'Purchased');
  });

  it('allows the owner to update sale administration settings', async function () {
    const { owner, treasury, other, buyer, presale, saleStart, saleEnd, vestingStart } = await deployPresaleFixture();
    const nextSaleStart = saleStart + 1_000n;
    const nextSaleEnd = saleEnd + 1_000n;
    const nextVestingStart = vestingStart + 2_000n;
    const nextVestingDuration = 365n * 24n * 60n * 60n;
    const nextMin = ethers.parseEther('2');
    const nextMax = ethers.parseEther('5000');
    const nextCap = ethers.parseEther('15000');

    await expect(presale.connect(owner).setTreasury(other.address))
      .to.emit(presale, 'TreasuryUpdated')
      .withArgs(treasury.address, other.address);
    expect(await presale.treasury()).to.equal(other.address);

    await expect(presale.connect(owner).setSaleWindow(nextSaleStart, nextSaleEnd))
      .to.emit(presale, 'SaleWindowUpdated')
      .withArgs(nextSaleStart, nextSaleEnd);
    expect(await presale.saleStart()).to.equal(nextSaleStart);
    expect(await presale.saleEnd()).to.equal(nextSaleEnd);

    await expect(presale.connect(owner).setPurchaseLimits(nextMin, nextMax, nextCap))
      .to.emit(presale, 'PurchaseLimitsUpdated')
      .withArgs(nextMin, nextMax, nextCap);
    expect(await presale.minAsmPerPurchase()).to.equal(nextMin);
    expect(await presale.maxAsmPerPurchase()).to.equal(nextMax);
    expect(await presale.walletAsmCap()).to.equal(nextCap);

    await expect(presale.connect(owner).setVestingConfig(nextVestingStart, nextVestingDuration))
      .to.emit(presale, 'VestingConfigUpdated')
      .withArgs(nextVestingStart, nextVestingDuration);
    expect(await presale.vestingStart()).to.equal(nextVestingStart);
    expect(await presale.vestingDuration()).to.equal(nextVestingDuration);

    await expect(presale.connect(buyer).setTreasury(treasury.address))
      .to.be.revertedWithCustomError(presale, 'OwnableUnauthorizedAccount')
      .withArgs(buyer.address);
  });

  it('rejects invalid owner sale configuration updates', async function () {
    const { presale, saleStart, saleEnd, vestingStart } = await deployPresaleFixture();

    await expect(presale.setTreasury(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(presale, 'InvalidAddress');
    await expect(presale.setSaleWindow(0, saleEnd))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(presale.setSaleWindow(saleEnd, saleStart))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(presale.setPurchaseLimits(0, ethers.parseEther('10'), ethers.parseEther('10')))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(presale.setPurchaseLimits(ethers.parseEther('20'), ethers.parseEther('10'), ethers.parseEther('30')))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(presale.setPurchaseLimits(ethers.parseEther('1'), ethers.parseEther('20'), ethers.parseEther('10')))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(presale.setVestingConfig(0, 1))
      .to.be.revertedWithCustomError(presale, 'InvalidVesting');
    await expect(presale.setVestingConfig(vestingStart, 0))
      .to.be.revertedWithCustomError(presale, 'InvalidVesting');
  });

  it('rejects invalid constructor configuration', async function () {
    const { owner, treasury, asm, vault, presale, saleStart, saleEnd, vestingStart, vestingDuration } = await deployPresaleFixture();
    const Presale = await ethers.getContractFactory('Presale');
    const baseConfig = {
      owner: owner.address,
      asmToken: await asm.getAddress(),
      vestingVault: await vault.getAddress(),
      treasury: treasury.address,
      saleStart,
      saleEnd,
      ukiPerAsm: ethers.parseEther('100'),
      minAsmPerPurchase: ethers.parseEther('1'),
      maxAsmPerPurchase: ethers.parseEther('10000'),
      walletAsmCap: ethers.parseEther('20000'),
      totalUkiForSale: ethers.parseEther('10000000'),
      vestingStart,
      vestingDuration,
    };

    await expect(Presale.deploy({ ...baseConfig, owner: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(presale, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
    await expect(Presale.deploy({ ...baseConfig, asmToken: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(presale, 'InvalidAddress');
    await expect(Presale.deploy({ ...baseConfig, treasury: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(presale, 'InvalidAddress');
    await expect(Presale.deploy({ ...baseConfig, saleStart: 0 }))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(Presale.deploy({ ...baseConfig, saleEnd: saleStart }))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(Presale.deploy({ ...baseConfig, ukiPerAsm: 0 }))
      .to.be.revertedWithCustomError(presale, 'InvalidRate');
    await expect(Presale.deploy({ ...baseConfig, minAsmPerPurchase: 0 }))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(Presale.deploy({
      ...baseConfig,
      minAsmPerPurchase: ethers.parseEther('2'),
      maxAsmPerPurchase: ethers.parseEther('1'),
    }))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(Presale.deploy({
      ...baseConfig,
      maxAsmPerPurchase: ethers.parseEther('3'),
      walletAsmCap: ethers.parseEther('2'),
    }))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(Presale.deploy({ ...baseConfig, totalUkiForSale: 0 }))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
    await expect(Presale.deploy({ ...baseConfig, vestingStart: 0 }))
      .to.be.revertedWithCustomError(presale, 'InvalidVesting');
    await expect(Presale.deploy({ ...baseConfig, vestingDuration: 0 }))
      .to.be.revertedWithCustomError(presale, 'InvalidVesting');
  });
});
