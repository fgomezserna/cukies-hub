const hre = require('hardhat');

async function deploy(name, args = []) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const [deployer, treasury, buyer, team, advisor, ecosystem] = await hre.ethers.getSigners();
  const now = Math.floor(Date.now() / 1000);
  const saleStart = BigInt(now + 60);
  const saleEnd = saleStart + 30n * 24n * 60n * 60n;
  const presaleVestingStart = saleEnd;
  const nineMonths = 9n * 30n * 24n * 60n * 60n;
  const oneYear = 365n * 24n * 60n * 60n;
  const twoYears = 2n * oneYear;

  const asm = await deploy('MockERC20', ['ApeSwap', 'ASM']);
  const uki = await deploy('UKIToken', [
    deployer.address,
    deployer.address,
    hre.ethers.parseEther('1000000000'),
  ]);
  const vault = await deploy('VestingVault', [await uki.getAddress(), deployer.address, presaleVestingStart, nineMonths, saleEnd]);
  const presale = await deploy('Presale', [{
    owner: deployer.address,
    asmToken: await asm.getAddress(),
    vestingVault: await vault.getAddress(),
    treasury: treasury.address,
    saleStart,
    saleEnd,
    ukiPerAsm: hre.ethers.parseEther('100'),
    minAsmPerPurchase: hre.ethers.parseEther('5'),
    totalUkiForSale: hre.ethers.parseEther('250000000'),
  }]);

  await uki.transfer(await vault.getAddress(), hre.ethers.parseEther('400000000'));
  await vault.grantRole(await vault.PRESALE_VESTING_ROLE(), await presale.getAddress());
  await vault.grantRole(await vault.ALLOCATION_MANAGER_ROLE(), deployer.address);

  await vault.createVestingWithCliff(
    team.address,
    hre.ethers.id('TEAM'),
    hre.ethers.parseEther('80000000'),
    BigInt(now) + oneYear,
    BigInt(now) + oneYear,
    twoYears
  );
  await vault.createVestingWithCliff(
    advisor.address,
    hre.ethers.id('ADVISORS'),
    hre.ethers.parseEther('20000000'),
    BigInt(now) + 180n * 24n * 60n * 60n,
    BigInt(now) + 180n * 24n * 60n * 60n,
    oneYear
  );
  await vault.createVestingWithCliff(
    ecosystem.address,
    hre.ethers.id('ECOSYSTEM'),
    hre.ethers.parseEther('40000000'),
    BigInt(now) + 30n * 24n * 60n * 60n,
    BigInt(now) + 30n * 24n * 60n * 60n,
    twoYears
  );

  await presale.setSaleEnabled(true);
  await vault.freezePresaleVestingConfig();

  await asm.mint(buyer.address, hre.ethers.parseEther('5000'));
  await asm.connect(buyer).approve(await presale.getAddress(), hre.ethers.MaxUint256);
  await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(saleStart)]);
  await presale.connect(buyer).buy(hre.ethers.parseEther('1000'));

  const buyerSchedule = await vault['scheduleOf(address)'](buyer.address);
  const teamSchedule = await vault['scheduleOf(address,bytes32)'](team.address, hre.ethers.id('TEAM'));

  console.log(JSON.stringify({
    network: hre.network.name,
    deployer: deployer.address,
    contracts: {
      asm: await asm.getAddress(),
      uki: await uki.getAddress(),
      vestingVault: await vault.getAddress(),
      presale: await presale.getAddress(),
    },
    sale: {
      treasury: treasury.address,
      buyerAsmPaid: hre.ethers.formatEther(await presale.asmPurchased(buyer.address)),
      buyerUkiAllocated: hre.ethers.formatEther(buyerSchedule.totalAmount),
    },
    vesting: {
      vaultUkiBalance: hre.ethers.formatEther(await uki.balanceOf(await vault.getAddress())),
      totalAllocated: hre.ethers.formatEther(await vault.totalAllocated()),
      unallocated: hre.ethers.formatEther(await vault.unallocatedBalance()),
      buyerScheduleIds: await vault.scheduleIdsOf(buyer.address),
      teamUkiAllocated: hre.ethers.formatEther(teamSchedule.totalAmount),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
