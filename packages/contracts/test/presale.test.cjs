const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Presale', function () {
  async function deployPresaleFixture() {
    const [owner, treasury, buyer, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const asm = await MockERC20.deploy('ApeSwap', 'ASM');

    const now = await time.latest();
    const saleStart = BigInt(now + 100);
    const saleEnd = saleStart + 30n * 24n * 60n * 60n;
    const vestingStart = saleEnd;
    const vestingDuration = 9n * 30n * 24n * 60n * 60n;
    const minAsmPerPurchase = ethers.parseEther('5');
    const totalUkiForSale = ethers.parseEther('250000000');

    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(owner.address, owner.address, ethers.parseEther('1000000000'));

    const VestingVault = await ethers.getContractFactory('VestingVault');
    const vault = await VestingVault.deploy(await uki.getAddress(), owner.address, vestingStart, vestingDuration, saleEnd);
    await uki.transfer(await vault.getAddress(), totalUkiForSale);

    const Presale = await ethers.getContractFactory('Presale');
    const presale = await Presale.deploy({
      owner: owner.address,
      asmToken: await asm.getAddress(),
      vestingVault: await vault.getAddress(),
      treasury: treasury.address,
      saleStart,
      saleEnd,
      ukiPerAsm: ethers.parseEther('100'),
      minAsmPerPurchase,
      totalUkiForSale,
    });

    await vault.grantRole(await vault.PRESALE_VESTING_ROLE(), await presale.getAddress());
    await asm.mint(buyer.address, ethers.parseEther('3000000'));
    await asm.connect(buyer).approve(await presale.getAddress(), ethers.MaxUint256);

    return {
      owner,
      treasury,
      buyer,
      other,
      asm,
      uki,
      vault,
      presale,
      saleStart,
      saleEnd,
      vestingStart,
      vestingDuration,
      minAsmPerPurchase,
      totalUkiForSale,
    };
  }

  async function openSale(presale, saleStart) {
    await presale.setSaleEnabled(true);
    await time.setNextBlockTimestamp(saleStart);
  }

  it('sells UKI with ASM and creates buyer vesting from the vault pool', async function () {
    const { treasury, buyer, asm, vault, presale, saleStart, vestingStart, vestingDuration } =
      await deployPresaleFixture();
    await vault.freezePresaleVestingConfig();
    await openSale(presale, saleStart);

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

  it('requires the sale to be explicitly enabled before buys', async function () {
    const { buyer, presale, saleStart } = await deployPresaleFixture();
    await time.setNextBlockTimestamp(saleStart);

    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.be.revertedWithCustomError(presale, 'SaleNotEnabled');
  });

  it('allows multiple purchases by the same wallet without per-wallet caps', async function () {
    const { buyer, vault, presale, saleStart } = await deployPresaleFixture();
    await openSale(presale, saleStart);

    await presale.connect(buyer).buy(ethers.parseEther('1000000'));
    await presale.connect(buyer).buy(ethers.parseEther('1000000'));

    expect(await presale.asmPurchased(buyer.address)).to.equal(ethers.parseEther('2000000'));
    expect(await presale.ukiPurchased(buyer.address)).to.equal(ethers.parseEther('200000000'));
    const schedule = await vault.scheduleOf(buyer.address);
    expect(schedule.totalAmount).to.equal(ethers.parseEther('200000000'));
  });

  it('reverts outside the sale window and below the 5 ASM minimum', async function () {
    const { buyer, presale, saleStart, saleEnd } = await deployPresaleFixture();
    await presale.setSaleEnabled(true);

    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.be.revertedWithCustomError(presale, 'SaleNotOpen');

    await time.setNextBlockTimestamp(saleStart);
    await expect(presale.connect(buyer).buy(ethers.parseEther('4.999999999999999999')))
      .to.be.revertedWithCustomError(presale, 'PurchaseTooSmall');

    await time.setNextBlockTimestamp(saleEnd + 1n);
    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.be.revertedWithCustomError(presale, 'SaleNotOpen');
  });

  it('reverts when the 250M UKI ecosystem sale cap is exceeded', async function () {
    const { buyer, presale, saleStart } = await deployPresaleFixture();
    await openSale(presale, saleStart);

    await presale.connect(buyer).buy(ethers.parseEther('2500000'));
    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
  });

  it('blocks buys while paused', async function () {
    const { owner, buyer, presale, saleStart } = await deployPresaleFixture();
    await openSale(presale, saleStart);

    await presale.connect(owner).pause();
    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.be.revertedWithCustomError(presale, 'EnforcedPause');

    await presale.connect(owner).unpause();
    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.emit(presale, 'Purchased');
  });

  it('does not allow ownership renounce to strand pause recovery', async function () {
    const { owner, presale } = await deployPresaleFixture();

    await expect(presale.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(presale, 'OwnershipRenounceDisabled');
    expect(await presale.owner()).to.equal(owner.address);
  });

  it('allows the owner to update mutable administration settings before enabling', async function () {
    const { owner, treasury, other, buyer, presale, saleStart, saleEnd } = await deployPresaleFixture();
    const nextSaleStart = saleStart + 1_000n;
    const nextSaleEnd = saleEnd + 1_000n;
    const nextMin = ethers.parseEther('10');
    const nextTotalUkiForSale = ethers.parseEther('200000000');
    const nextUkiPerAsm = ethers.parseEther('80');

    await expect(presale.connect(owner).setTreasury(other.address))
      .to.emit(presale, 'TreasuryUpdated')
      .withArgs(treasury.address, other.address);
    expect(await presale.treasury()).to.equal(other.address);

    await expect(presale.connect(owner).setSaleWindow(nextSaleStart, nextSaleEnd))
      .to.emit(presale, 'SaleWindowUpdated')
      .withArgs(nextSaleStart, nextSaleEnd);
    expect(await presale.saleStart()).to.equal(nextSaleStart);
    expect(await presale.saleEnd()).to.equal(nextSaleEnd);

    await expect(presale.connect(owner).setMinAsmPerPurchase(nextMin))
      .to.emit(presale, 'MinPurchaseUpdated')
      .withArgs(nextMin);
    expect(await presale.minAsmPerPurchase()).to.equal(nextMin);

    await expect(presale.connect(owner).setTotalUkiForSale(nextTotalUkiForSale))
      .to.emit(presale, 'TotalUkiForSaleUpdated')
      .withArgs(nextTotalUkiForSale);
    expect(await presale.totalUkiForSale()).to.equal(nextTotalUkiForSale);

    await expect(presale.connect(owner).setUkiPerAsm(nextUkiPerAsm))
      .to.emit(presale, 'UkiPerAsmUpdated')
      .withArgs(ethers.parseEther('100'), nextUkiPerAsm);
    expect(await presale.ukiPerAsm()).to.equal(nextUkiPerAsm);

    await expect(presale.connect(buyer).setTreasury(treasury.address))
      .to.be.revertedWithCustomError(presale, 'OwnableUnauthorizedAccount')
      .withArgs(buyer.address);
  });

  it('keeps sale settings editable after enabling and after purchases', async function () {
    const { owner, treasury, other, buyer, presale, saleStart, saleEnd } = await deployPresaleFixture();

    await expect(presale.connect(owner).setSaleEnabled(true))
      .to.emit(presale, 'SaleEnabledUpdated')
      .withArgs(true);
    expect(await presale.saleEnabled()).to.equal(true);

    await expect(presale.connect(owner).setUkiPerAsm(ethers.parseEther('120')))
      .to.emit(presale, 'UkiPerAsmUpdated')
      .withArgs(ethers.parseEther('100'), ethers.parseEther('120'));

    await time.setNextBlockTimestamp(saleStart);
    await expect(presale.connect(buyer).buy(ethers.parseEther('5')))
      .to.emit(presale, 'Purchased')
      .withArgs(
        buyer.address,
        ethers.parseEther('5'),
        ethers.parseEther('600'),
        ethers.parseEther('5'),
        ethers.parseEther('600')
      );

    await expect(presale.connect(owner).setTreasury(other.address))
      .to.emit(presale, 'TreasuryUpdated')
      .withArgs(treasury.address, other.address);
    await expect(presale.connect(owner).setSaleWindow(saleStart + 1n, saleEnd + 1n))
      .to.emit(presale, 'SaleWindowUpdated')
      .withArgs(saleStart + 1n, saleEnd + 1n);
    await expect(presale.connect(owner).setMinAsmPerPurchase(ethers.parseEther('10')))
      .to.emit(presale, 'MinPurchaseUpdated')
      .withArgs(ethers.parseEther('10'));
    await expect(presale.connect(owner).setTotalUkiForSale(ethers.parseEther('200000000')))
      .to.emit(presale, 'TotalUkiForSaleUpdated')
      .withArgs(ethers.parseEther('200000000'));
    await expect(presale.connect(owner).setTotalUkiForSale(ethers.parseEther('599')))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
    await expect(presale.connect(owner).setSaleEnabled(false))
      .to.emit(presale, 'SaleEnabledUpdated')
      .withArgs(false);
    await expect(presale.connect(buyer).buy(ethers.parseEther('10')))
      .to.be.revertedWithCustomError(presale, 'SaleNotEnabled');
  });

  it('applies ukiPerAsm changes only to later purchases', async function () {
    const { owner, buyer, presale, saleStart } = await deployPresaleFixture();
    await openSale(presale, saleStart);

    await presale.connect(buyer).buy(ethers.parseEther('10'));
    await expect(presale.connect(owner).setUkiPerAsm(ethers.parseEther('80')))
      .to.emit(presale, 'UkiPerAsmUpdated')
      .withArgs(ethers.parseEther('100'), ethers.parseEther('80'));
    await presale.connect(buyer).buy(ethers.parseEther('10'));

    expect(await presale.asmPurchased(buyer.address)).to.equal(ethers.parseEther('20'));
    expect(await presale.ukiPurchased(buyer.address)).to.equal(ethers.parseEther('1800'));
  });

  it('rejects invalid owner sale configuration updates', async function () {
    const { presale, saleStart, saleEnd } = await deployPresaleFixture();

    await expect(presale.setTreasury(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(presale, 'InvalidAddress');
    await expect(presale.setSaleWindow(0, saleEnd))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(presale.setSaleWindow(saleEnd, saleStart))
      .to.be.revertedWithCustomError(presale, 'InvalidSaleWindow');
    await expect(presale.setMinAsmPerPurchase(0))
      .to.be.revertedWithCustomError(presale, 'InvalidLimits');
    await expect(presale.setUkiPerAsm(0))
      .to.be.revertedWithCustomError(presale, 'InvalidRate');
    await expect(presale.setTotalUkiForSale(0))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
    await expect(presale.setTotalUkiForSale(1n << 128n))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
  });

  it('rejects invalid constructor configuration', async function () {
    const { owner, treasury, asm, vault, presale, saleStart, saleEnd } = await deployPresaleFixture();
    const Presale = await ethers.getContractFactory('Presale');
    const baseConfig = {
      owner: owner.address,
      asmToken: await asm.getAddress(),
      vestingVault: await vault.getAddress(),
      treasury: treasury.address,
      saleStart,
      saleEnd,
      ukiPerAsm: ethers.parseEther('100'),
      minAsmPerPurchase: ethers.parseEther('5'),
      totalUkiForSale: ethers.parseEther('250000000'),
    };

    await expect(Presale.deploy({ ...baseConfig, owner: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(presale, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
    await expect(Presale.deploy({ ...baseConfig, asmToken: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(presale, 'InvalidAddress');
    await expect(Presale.deploy({ ...baseConfig, vestingVault: ethers.ZeroAddress }))
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
    await expect(Presale.deploy({ ...baseConfig, totalUkiForSale: 0 }))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
    await expect(Presale.deploy({ ...baseConfig, totalUkiForSale: (1n << 128n) }))
      .to.be.revertedWithCustomError(presale, 'SaleCapExceeded');
  });
});
