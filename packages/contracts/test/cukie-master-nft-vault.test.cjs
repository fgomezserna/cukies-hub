const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('CukieMasterNftVault', function () {
  async function deployFixture() {
    const [owner, alice, bob, nextOwner] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory('CukieMasterNftVault');
    const vault = await Vault.deploy(owner.address);
    const Nft = await ethers.getContractFactory('MockERC721');
    const nft = await Nft.deploy('Cukies Originales', 'CUKI');

    return { owner, alice, bob, nextOwner, Vault, vault, nft };
  }

  async function allowCollection(vault, owner, collection) {
    await vault.connect(owner).setCollectionAllowed(await collection.getAddress(), true);
  }

  async function mintAndApprove(vault, nft, account, tokenId) {
    await nft.mint(account.address, tokenId);
    await nft.connect(account).approve(await vault.getAddress(), tokenId);
  }

  it('allowlists only deployed collections under two-step ownership control', async function () {
    const { owner, alice, nextOwner, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();

    await expect(vault.connect(alice).setCollectionAllowed(collection, true))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(vault.connect(owner).setCollectionAllowed(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(vault, 'InvalidCollection');
    await expect(vault.connect(owner).setCollectionAllowed(alice.address, true))
      .to.be.revertedWithCustomError(vault, 'InvalidCollection');

    await expect(vault.connect(owner).setCollectionAllowed(collection, true))
      .to.emit(vault, 'CollectionAllowedUpdated')
      .withArgs(collection, true);
    expect(await vault.collectionAllowed(collection)).to.equal(true);

    await vault.connect(owner).transferOwnership(nextOwner.address);
    await expect(vault.connect(nextOwner).setCollectionAllowed(collection, false))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await vault.connect(nextOwner).acceptOwnership();
    await expect(vault.connect(nextOwner).setCollectionAllowed(collection, false))
      .to.emit(vault, 'CollectionAllowedUpdated')
      .withArgs(collection, false);
  });

  it('custodies an approved NFT and records indexable beneficiary and epoch evidence', async function () {
    const { owner, alice, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 101);

    await expect(vault.connect(alice).deposit(collection, 101))
      .to.emit(vault, 'Deposited')
      .withArgs(collection, 101, alice.address, 1, anyValue);

    const position = await vault.positionOf(collection, 101);
    expect(position.beneficialOwner).to.equal(alice.address);
    expect(position.depositEpoch).to.equal(1);
    expect(position.depositedAt).to.be.greaterThan(0);
    expect(await vault.beneficialOwnerOf(collection, 101)).to.equal(alice.address);
    expect(await vault.depositEpochOf(collection, 101)).to.equal(1);
    expect(await vault.totalDepositEpochs(collection, 101)).to.equal(1);
    expect(await nft.ownerOf(101)).to.equal(await vault.getAddress());
  });

  it('rejects unsupported collections, non-owners and missing approvals without mutating state', async function () {
    const { owner, alice, bob, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await nft.mint(alice.address, 102);

    await expect(vault.connect(alice).deposit(collection, 102))
      .to.be.revertedWithCustomError(vault, 'CollectionNotAllowed');
    await allowCollection(vault, owner, nft);
    await expect(vault.connect(bob).deposit(collection, 102))
      .to.be.revertedWithCustomError(vault, 'NotTokenOwner')
      .withArgs(bob.address, alice.address);
    await expect(vault.connect(alice).deposit(collection, 102))
      .to.be.revertedWithCustomError(nft, 'ERC721InsufficientApproval');

    expect(await nft.ownerOf(102)).to.equal(alice.address);
    expect(await vault.beneficialOwnerOf(collection, 102)).to.equal(ethers.ZeroAddress);
    expect(await vault.totalDepositEpochs(collection, 102)).to.equal(0);
  });

  it('rejects direct safe transfers and callback-only collections that never deliver custody', async function () {
    const { owner, alice, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await nft.mint(alice.address, 103);

    await expect(
      nft.connect(alice)['safeTransferFrom(address,address,uint256)'](
        alice.address,
        await vault.getAddress(),
        103,
      ),
    ).to.be.revertedWithCustomError(vault, 'UnexpectedERC721Transfer');
    expect(await nft.ownerOf(103)).to.equal(alice.address);

    const CallbackOnly = await ethers.getContractFactory('CallbackOnlyERC721');
    const callbackOnly = await CallbackOnly.deploy();
    const callbackCollection = await callbackOnly.getAddress();
    await allowCollection(vault, owner, callbackOnly);
    await mintAndApprove(vault, callbackOnly, alice, 104);

    await expect(vault.connect(alice).deposit(callbackCollection, 104))
      .to.be.revertedWithCustomError(vault, 'CustodyNotReceived');
    expect(await callbackOnly.ownerOf(104)).to.equal(alice.address);
    expect(await vault.beneficialOwnerOf(callbackCollection, 104)).to.equal(ethers.ZeroAddress);
  });

  it('recovers unsafe direct transfers through an owner-only audited path without touching positions', async function () {
    const { owner, alice, bob, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await nft.mint(alice.address, 112);
    await nft.connect(alice).transferFrom(alice.address, await vault.getAddress(), 112);

    expect(await nft.ownerOf(112)).to.equal(await vault.getAddress());
    expect(await vault.beneficialOwnerOf(collection, 112)).to.equal(ethers.ZeroAddress);
    await expect(vault.connect(alice).recoverUntrackedERC721(collection, 112, alice.address))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 112, alice.address))
      .to.emit(vault, 'UntrackedERC721Recovered')
      .withArgs(collection, 112, alice.address, anyValue);
    expect(await nft.ownerOf(112)).to.equal(alice.address);

    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 112, bob.address))
      .to.be.revertedWithCustomError(vault, 'UntrackedAssetNotCustodied');
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 112, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(vault, 'InvalidRecipient');
  });

  it('returns the NFT immediately only to its beneficiary and clears the live position first', async function () {
    const { owner, alice, bob, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 105);
    await vault.connect(alice).deposit(collection, 105);

    await expect(vault.connect(bob).withdraw(collection, 105))
      .to.be.revertedWithCustomError(vault, 'NotBeneficialOwner')
      .withArgs(bob.address, alice.address);
    await expect(vault.connect(alice).withdraw(collection, 105))
      .to.emit(vault, 'Withdrawn')
      .withArgs(collection, 105, alice.address, 1, anyValue);

    expect(await nft.ownerOf(105)).to.equal(alice.address);
    expect(await vault.beneficialOwnerOf(collection, 105)).to.equal(ethers.ZeroAddress);
    expect(await vault.depositEpochOf(collection, 105)).to.equal(0);
    expect(await vault.totalDepositEpochs(collection, 105)).to.equal(1);
    await expect(vault.connect(alice).unstake(collection, 105))
      .to.be.revertedWithCustomError(vault, 'PositionNotFound');
  });

  it('never strands a beneficiary contract that does not implement IERC721Receiver', async function () {
    const { owner, alice, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    const NonReceiver = await ethers.getContractFactory('NonReceiverNftOwner');
    const nonReceiver = await NonReceiver.deploy(await vault.getAddress(), collection);
    const nonReceiverAddress = await nonReceiver.getAddress();
    await nft.mint(alice.address, 113);
    await nft.connect(alice).transferFrom(alice.address, nonReceiverAddress, 113);

    await nonReceiver.deposit(113);
    expect(await vault.beneficialOwnerOf(collection, 113)).to.equal(nonReceiverAddress);
    await nonReceiver.withdraw(113);

    expect(await nft.ownerOf(113)).to.equal(nonReceiverAddress);
    expect(await vault.beneficialOwnerOf(collection, 113)).to.equal(ethers.ZeroAddress);
  });

  it('blocks only new deposits while paused and never strands an existing beneficiary', async function () {
    const { owner, alice, bob, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 106);
    await mintAndApprove(vault, nft, bob, 107);
    await vault.connect(alice).deposit(collection, 106);
    await vault.connect(owner).pause();

    await expect(vault.connect(bob).deposit(collection, 107))
      .to.be.revertedWithCustomError(vault, 'EnforcedPause');
    await expect(vault.connect(alice).unstake(collection, 106))
      .to.emit(vault, 'Withdrawn');
    expect(await nft.ownerOf(106)).to.equal(alice.address);

    await vault.connect(owner).unpause();
    await expect(vault.connect(bob).deposit(collection, 107)).to.emit(vault, 'Deposited');
  });

  it('allows exit after a collection is disabled and starts a fresh monotonic epoch on re-entry', async function () {
    const { owner, alice, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 108);
    await vault.connect(alice).deposit(collection, 108);
    await vault.connect(owner).setCollectionAllowed(collection, false);
    await vault.connect(alice).withdraw(collection, 108);

    await nft.connect(alice).approve(await vault.getAddress(), 108);
    await expect(vault.connect(alice).deposit(collection, 108))
      .to.be.revertedWithCustomError(vault, 'CollectionNotAllowed');
    await vault.connect(owner).setCollectionAllowed(collection, true);
    await expect(vault.connect(alice).deposit(collection, 108))
      .to.emit(vault, 'Deposited')
      .withArgs(collection, 108, alice.address, 2, anyValue);
    expect(await vault.depositEpochOf(collection, 108)).to.equal(2);
    expect(await vault.totalDepositEpochs(collection, 108)).to.equal(2);
  });

  it('rolls back an exit if an allowlisted collection acknowledges but does not release custody', async function () {
    const { owner, alice, vault } = await deployFixture();
    const CallbackOnly = await ethers.getContractFactory('CallbackOnlyERC721');
    const nft = await CallbackOnly.deploy();
    const collection = await nft.getAddress();
    await nft.setCallbackOnly(false);
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 109);
    await vault.connect(alice).deposit(collection, 109);
    await nft.setCallbackOnly(true);

    await expect(vault.connect(alice).withdraw(collection, 109))
      .to.be.revertedWithCustomError(vault, 'CustodyNotReleased');
    expect(await nft.ownerOf(109)).to.equal(await vault.getAddress());
    expect(await vault.beneficialOwnerOf(collection, 109)).to.equal(alice.address);
  });

  it('prevents receiver reentrancy and exposes no stale beneficiary during the callback', async function () {
    const { owner, vault } = await deployFixture();
    const ReentrantCollection = await ethers.getContractFactory('ReentrantTransferERC721');
    const nft = await ReentrantCollection.deploy();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await nft.setCallbackFrom(await vault.getAddress());
    const Receiver = await ethers.getContractFactory('ReentrantNftReceiver');
    const receiver = await Receiver.deploy(await vault.getAddress(), collection);
    const receiverAddress = await receiver.getAddress();
    await nft.mint(receiverAddress, 110);
    await receiver.deposit(110);

    await receiver.withdraw(110);

    expect(await receiver.reentryAttempted()).to.equal(true);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await receiver.reentryErrorSelector())
      .to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
    expect(await receiver.beneficialOwnerObservedDuringCallback()).to.equal(ethers.ZeroAddress);
    expect(await nft.ownerOf(110)).to.equal(receiverAddress);
    expect(await vault.beneficialOwnerOf(collection, 110)).to.equal(ethers.ZeroAddress);
  });

  it('rejects duplicate live deposits before attempting another token transfer', async function () {
    const { owner, alice, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await allowCollection(vault, owner, nft);
    await mintAndApprove(vault, nft, alice, 111);
    await vault.connect(alice).deposit(collection, 111);

    await expect(vault.connect(alice).deposit(collection, 111))
      .to.be.revertedWithCustomError(vault, 'PositionAlreadyExists');
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 111, alice.address))
      .to.be.revertedWithCustomError(vault, 'RegisteredPosition');
    expect(await nft.ownerOf(111)).to.equal(await vault.getAddress());
    expect(await vault.totalDepositEpochs(collection, 111)).to.equal(1);
  });

  it('restricts pause controls, disables renunciation and rejects a zero initial owner', async function () {
    const { owner, alice, Vault, vault } = await deployFixture();

    await expect(vault.connect(alice).pause())
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(vault.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(vault, 'OwnershipRenounceDisabled');
    await expect(Vault.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(vault, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
  });
});
