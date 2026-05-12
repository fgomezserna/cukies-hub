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
    expect(schedule.duration).to.equal(vestingDuration);
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
  });
});
