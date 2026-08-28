const hre = require('hardhat');

async function main() {
  if (hre.network.name !== 'bscTestnet' || hre.network.config.chainId !== 97) {
    throw new Error('Reward publisher canary is BSC Testnet-only.');
  }
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required.');
  const deployerAddress = await deployer.getAddress();
  const bnb = await hre.ethers.provider.getBalance(deployerAddress);
  if (bnb === 0n) throw new Error('Canary deployer has no tBNB.');

  const supply = hre.ethers.parseEther('1000');
  const UKIToken = await hre.ethers.getContractFactory('UKIToken');
  const token = await UKIToken.deploy(deployerAddress, deployerAddress, supply);
  const tokenReceipt = await token.deploymentTransaction().wait();
  const tokenAddress = await token.getAddress();

  const RewardsDistributor = await hre.ethers.getContractFactory('RewardsDistributor');
  const distributor = await RewardsDistributor.deploy(tokenAddress, deployerAddress);
  const distributorReceipt = await distributor.deploymentTransaction().wait();
  const distributorAddress = await distributor.getAddress();

  console.log(JSON.stringify({
    chainId: 97,
    signerAddress: deployerAddress,
    tokenAddress,
    distributorAddress,
    tokenDeploymentTransaction: token.deploymentTransaction().hash,
    tokenDeploymentBlock: tokenReceipt.blockNumber,
    distributorDeploymentTransaction: distributor.deploymentTransaction().hash,
    distributorDeploymentBlock: distributorReceipt.blockNumber,
    initialSupplyRaw: supply.toString(),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
