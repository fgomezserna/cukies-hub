const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('StagingCukiesNftV2', function () {
  async function deployFixture() {
    const [owner, alice, bob, operator] = await ethers.getSigners();
    const Nft = await ethers.getContractFactory('StagingCukiesNftV2');
    const nft = await Nft.deploy(owner.address);
    const MasterVault = await ethers.getContractFactory('CukieMasterNftVault');
    const masterVault = await MasterVault.deploy(owner.address);
    const PoolVault = await ethers.getContractFactory('CukiePoolNftVault');
    const poolVault = await PoolVault.deploy(owner.address, 86400);
    const collection = await nft.getAddress();
    await masterVault.connect(owner).setCollectionAllowed(collection, true);
    await poolVault.connect(owner).setCollectionAllowed(collection, true);

    return { owner, alice, bob, operator, nft, collection, masterVault, poolVault };
  }

  it('exposes ERC165, ERC721 and ERC721 metadata interfaces', async function () {
    const { nft } = await deployFixture();

    expect(await nft.supportsInterface('0x01ffc9a7')).to.equal(true);
    expect(await nft.supportsInterface('0x80ac58cd')).to.equal(true);
    expect(await nft.supportsInterface('0x5b5e139f')).to.equal(true);
    expect(await nft.supportsInterface('0xffffffff')).to.equal(false);
  });

  it('mints only as owner and preserves bounded Cukie metadata', async function () {
    const { owner, alice, nft } = await deployFixture();

    await expect(nft.connect(owner).mint(alice.address, 0, 1, 1))
      .to.emit(nft, 'CukieMetadataConfigured')
      .withArgs(0, 1, 1);
    await expect(nft.connect(owner).mint(alice.address, 42, 6, 2))
      .to.emit(nft, 'Transfer')
      .withArgs(ethers.ZeroAddress, alice.address, 42);

    expect(await nft.name()).to.equal('Staging Cukies V2');
    expect(await nft.symbol()).to.equal('stCUKI2');
    expect(await nft.ownerOf(0)).to.equal(alice.address);
    expect(await nft.balanceOf(alice.address)).to.equal(2);
    expect(await nft.cukieMetadata(0)).to.deep.equal([1n, 1n]);
    expect(await nft.cukieMetadata(42)).to.deep.equal([6n, 2n]);
    expect(await nft.tokenURI(0)).to.equal('staging://cukies/0');
    expect(await nft.tokenURI(42)).to.equal('staging://cukies/42');
  });

  it('rejects unauthorized, duplicate and invalid mints without leaving partial state', async function () {
    const { owner, alice, bob, nft } = await deployFixture();

    await expect(nft.connect(alice).mint(alice.address, 1, 1, 1))
      .to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(nft.connect(owner).mint(ethers.ZeroAddress, 1, 1, 1))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidReceiver')
      .withArgs(ethers.ZeroAddress);
    await expect(nft.connect(owner).mint(alice.address, 1, 0, 1))
      .to.be.revertedWithCustomError(nft, 'InvalidRarity')
      .withArgs(0);
    await expect(nft.connect(owner).mint(alice.address, 1, 7, 1))
      .to.be.revertedWithCustomError(nft, 'InvalidRarity')
      .withArgs(7);
    await expect(nft.connect(owner).mint(alice.address, 1, 1, 0))
      .to.be.revertedWithCustomError(nft, 'InvalidGeneration')
      .withArgs(0);
    await expect(nft.connect(owner).mint(alice.address, 1, 1, 3))
      .to.be.revertedWithCustomError(nft, 'InvalidGeneration')
      .withArgs(3);

    await nft.connect(owner).mint(alice.address, 1, 2, 1);
    await expect(nft.connect(owner).mint(bob.address, 1, 3, 2))
      .to.be.revertedWithCustomError(nft, 'ERC721TokenAlreadyMinted')
      .withArgs(1);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.cukieMetadata(1)).to.deep.equal([2n, 1n]);
  });

  it('supports token and operator approvals, clears token approval on transfer and updates balances', async function () {
    const { owner, alice, bob, operator, nft } = await deployFixture();
    await nft.connect(owner).mint(alice.address, 10, 3, 1);

    await expect(nft.connect(alice).approve(operator.address, 10))
      .to.emit(nft, 'Approval')
      .withArgs(alice.address, operator.address, 10);
    expect(await nft.getApproved(10)).to.equal(operator.address);
    await expect(nft.connect(operator).transferFrom(alice.address, bob.address, 10))
      .to.emit(nft, 'Transfer')
      .withArgs(alice.address, bob.address, 10);
    expect(await nft.ownerOf(10)).to.equal(bob.address);
    expect(await nft.getApproved(10)).to.equal(ethers.ZeroAddress);
    expect(await nft.balanceOf(alice.address)).to.equal(0);
    expect(await nft.balanceOf(bob.address)).to.equal(1);

    await expect(nft.connect(bob).setApprovalForAll(operator.address, true))
      .to.emit(nft, 'ApprovalForAll')
      .withArgs(bob.address, operator.address, true);
    expect(await nft.isApprovedForAll(bob.address, operator.address)).to.equal(true);
    await nft.connect(operator).transferFrom(bob.address, alice.address, 10);
    expect(await nft.ownerOf(10)).to.equal(alice.address);
  });

  it('rejects invalid approvals and unauthorized or malformed transfers', async function () {
    const { owner, alice, bob, operator, nft } = await deployFixture();
    await nft.connect(owner).mint(alice.address, 11, 3, 2);

    await expect(nft.connect(bob).approve(operator.address, 11))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidApprover')
      .withArgs(bob.address);
    await expect(nft.connect(alice).setApprovalForAll(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidOperator')
      .withArgs(ethers.ZeroAddress);
    await expect(nft.connect(alice).setApprovalForAll(alice.address, true))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidOperator')
      .withArgs(alice.address);
    await expect(nft.connect(bob).transferFrom(alice.address, bob.address, 11))
      .to.be.revertedWithCustomError(nft, 'ERC721InsufficientApproval')
      .withArgs(bob.address, 11);
    await expect(nft.connect(alice).transferFrom(bob.address, alice.address, 11))
      .to.be.revertedWithCustomError(nft, 'ERC721IncorrectOwner')
      .withArgs(bob.address, 11, alice.address);
    await expect(nft.connect(alice).transferFrom(alice.address, ethers.ZeroAddress, 11))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidReceiver')
      .withArgs(ethers.ZeroAddress);
    await expect(nft.ownerOf(999)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
    await expect(nft.getApproved(999)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
    await expect(nft.tokenURI(999)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
    await expect(nft.balanceOf(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(nft, 'ERC721InvalidOwner');
  });

  it('safely enters and exits the Cukie Master custodial vault', async function () {
    const { owner, alice, nft, collection, masterVault } = await deployFixture();
    const vaultAddress = await masterVault.getAddress();
    await nft.connect(owner).mint(alice.address, 20, 5, 1);
    await nft.connect(alice).approve(vaultAddress, 20);

    await expect(masterVault.connect(alice).deposit(collection, 20))
      .to.emit(masterVault, 'Deposited');
    expect(await nft.ownerOf(20)).to.equal(vaultAddress);
    expect(await masterVault.beneficialOwnerOf(collection, 20)).to.equal(alice.address);
    expect(await nft.cukieMetadata(20)).to.deep.equal([5n, 1n]);

    await expect(masterVault.connect(alice).withdraw(collection, 20))
      .to.emit(masterVault, 'Withdrawn');
    expect(await nft.ownerOf(20)).to.equal(alice.address);
    expect(await masterVault.beneficialOwnerOf(collection, 20)).to.equal(ethers.ZeroAddress);
  });

  it('safely enters the Cukie Pool vault and exits at its immutable cutoff', async function () {
    const { owner, alice, nft, collection, poolVault } = await deployFixture();
    const vaultAddress = await poolVault.getAddress();
    await nft.connect(owner).mint(alice.address, 21, 4, 2);
    await nft.connect(alice).approve(vaultAddress, 21);

    await expect(poolVault.connect(alice).deposit(collection, 21))
      .to.emit(poolVault, 'Deposited');
    expect(await nft.ownerOf(21)).to.equal(vaultAddress);
    expect(await poolVault.beneficialOwnerOf(collection, 21)).to.equal(alice.address);

    await poolVault.connect(alice).requestExit(collection, 21);
    const withdrawableAt = (await poolVault.positionOf(collection, 21)).withdrawableAt;
    await expect(poolVault.connect(alice).withdraw(collection, 21))
      .to.be.revertedWithCustomError(poolVault, 'WithdrawalNotReady')
      .withArgs(withdrawableAt);
    await time.increaseTo(withdrawableAt);
    await expect(poolVault.connect(alice).withdraw(collection, 21))
      .to.emit(poolVault, 'Withdrawn');
    expect(await nft.ownerOf(21)).to.equal(alice.address);
    expect(await poolVault.beneficialOwnerOf(collection, 21)).to.equal(ethers.ZeroAddress);
    expect(await nft.cukieMetadata(21)).to.deep.equal([4n, 2n]);
  });

  it('rejects unsafe callback destinations and direct safe transfers to either vault atomically', async function () {
    const { owner, alice, nft, collection, masterVault, poolVault } = await deployFixture();
    await nft.connect(owner).mint(alice.address, 30, 1, 1);

    await expect(
      nft.connect(alice)['safeTransferFrom(address,address,uint256)'](
        alice.address,
        await masterVault.getAddress(),
        30,
      ),
    ).to.be.revertedWithCustomError(masterVault, 'UnexpectedERC721Transfer');
    expect(await nft.ownerOf(30)).to.equal(alice.address);

    await expect(
      nft.connect(alice)['safeTransferFrom(address,address,uint256,bytes)'](
        alice.address,
        await poolVault.getAddress(),
        30,
        '0x1234',
      ),
    ).to.be.revertedWithCustomError(poolVault, 'UnexpectedERC721Transfer');
    expect(await nft.ownerOf(30)).to.equal(alice.address);
    expect(await nft.getApproved(30)).to.equal(ethers.ZeroAddress);
    expect(await masterVault.beneficialOwnerOf(collection, 30)).to.equal(ethers.ZeroAddress);
    expect(await poolVault.beneficialOwnerOf(collection, 30)).to.equal(ethers.ZeroAddress);
  });
});
