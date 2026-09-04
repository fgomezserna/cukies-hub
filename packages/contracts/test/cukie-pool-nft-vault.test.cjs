const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const DAY = 86_400n;
const INITIAL_ANCHOR = 50_400n;

describe('CukiePoolNftVault', function () {
  async function deployFixture() {
    const [owner, alice, bob, nextOwner] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory('CukiePoolNftVault');
    const vault = await Vault.deploy(owner.address, 86400);
    const Nft = await ethers.getContractFactory('MockERC721');
    const nft = await Nft.deploy('Cukies', 'CUKI');
    await vault.setCollectionAllowed(await nft.getAddress(), true);

    return { owner, alice, bob, nextOwner, Vault, vault, nft };
  }

  async function nextInitialCutoff(extraDays = 0n) {
    const now = BigInt(await time.latest());
    return INITIAL_ANCHOR + (((now - INITIAL_ANCHOR) / DAY) + 1n + extraDays) * DAY;
  }

  async function mintAndApprove(vault, nft, account, tokenId) {
    await nft.mint(account.address, tokenId);
    await nft.connect(account).approve(await vault.getAddress(), tokenId);
  }

  async function depositBeforeCutoff(fixture, tokenId, secondsBefore = 20n) {
    const { alice, vault, nft } = fixture;
    await mintAndApprove(vault, nft, alice, tokenId);
    let cutoff = await nextInitialCutoff();
    if (cutoff - secondsBefore <= BigInt(await time.latest())) cutoff += DAY;
    await time.setNextBlockTimestamp(cutoff - secondsBefore);
    await vault.connect(alice).deposit(await nft.getAddress(), tokenId);
    return cutoff;
  }

  it('defines exact initial periods at 13:59:59 and 14:00:00 UTC', async function () {
    const { vault } = await deployFixture();
    const cutoff = await nextInitialCutoff();
    const before = await vault.periodAt(cutoff - 1n);
    const exact = await vault.periodAt(cutoff);

    expect(before.startsAt).to.equal(cutoff - DAY);
    expect(before.endsAt).to.equal(cutoff);
    expect(before.calendarVersion).to.equal(1);
    expect(exact.startsAt).to.equal(cutoff);
    expect(exact.endsAt).to.equal(cutoff + DAY);
    expect(exact.periodId).to.equal(before.periodId + 1n);
    expect(await vault.calendarVersionAt(cutoff - 1n)).to.equal(1);
    expect(await vault.calendarVersionAt(cutoff)).to.equal(1);
    await expect(vault.periodAt(INITIAL_ANCHOR - 1n))
      .to.be.revertedWithCustomError(vault, 'TimestampBeforeCalendar');
  });

  it('activates a 13:59:59 deposit at 14:00 and a 14:00 deposit the following day', async function () {
    const first = await deployFixture();
    const firstCollection = await first.nft.getAddress();
    const cutoff = await nextInitialCutoff();
    await mintAndApprove(first.vault, first.nft, first.alice, 201);
    await time.setNextBlockTimestamp(cutoff - 1n);
    await expect(first.vault.connect(first.alice).deposit(firstCollection, 201))
      .to.emit(first.vault, 'Deposited')
      .withArgs(firstCollection, 201, first.alice.address, 1, cutoff - 1n, anyValue, cutoff, anyValue, 1);
    expect((await first.vault.positionOf(firstCollection, 201)).activationAt).to.equal(cutoff);

    const second = await deployFixture();
    const secondCollection = await second.nft.getAddress();
    const secondCutoff = await nextInitialCutoff();
    await mintAndApprove(second.vault, second.nft, second.alice, 202);
    await time.setNextBlockTimestamp(secondCutoff);
    await second.vault.connect(second.alice).deposit(secondCollection, 202);
    expect((await second.vault.positionOf(secondCollection, 202)).activationAt)
      .to.equal(secondCutoff + DAY);
  });

  it('derives pending and active lifecycle without a mass activation transaction', async function () {
    const fixture = await deployFixture();
    const { alice, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 203);

    expect(await vault.lifecycleOf(collection, 203)).to.equal(1);
    expect(await vault.isLendable(collection, 203)).to.equal(false);
    await time.increaseTo(cutoff);
    expect(await vault.lifecycleOf(collection, 203)).to.equal(2);
    expect(await vault.isLendable(collection, 203)).to.equal(true);
    expect(await vault.beneficialOwnerOf(collection, 203)).to.equal(alice.address);
  });

  it('keeps an active exiting NFT lendable until the cutoff and withdrawable exactly at it', async function () {
    const fixture = await deployFixture();
    const { alice, bob, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const activationAt = await depositBeforeCutoff(fixture, 204);
    await time.increaseTo(activationAt);
    const exitCutoff = activationAt + DAY;
    await time.setNextBlockTimestamp(exitCutoff - 10n);
    const exitPeriod = await vault.periodAt(exitCutoff - 10n);

    await expect(vault.connect(alice).requestExit(collection, 204))
      .to.emit(vault, 'ExitRequested')
      .withArgs(
        collection,
        204,
        alice.address,
        1,
        exitCutoff - 10n,
        exitPeriod.periodId,
        exitCutoff,
        1,
      );
    expect(await vault.lifecycleOf(collection, 204)).to.equal(3);
    expect(await vault.isLendable(collection, 204)).to.equal(true);
    await expect(vault.connect(bob).withdraw(collection, 204))
      .to.be.revertedWithCustomError(vault, 'NotBeneficialOwner');

    await time.setNextBlockTimestamp(exitCutoff - 1n);
    await expect(vault.connect(alice).withdraw(collection, 204))
      .to.be.revertedWithCustomError(vault, 'WithdrawalNotReady')
      .withArgs(exitCutoff);
    expect(await vault.isLendable(collection, 204)).to.equal(true);
    await time.setNextBlockTimestamp(exitCutoff);
    await expect(vault.connect(alice).withdraw(collection, 204))
      .to.emit(vault, 'Withdrawn')
      .withArgs(collection, 204, alice.address, 1, exitCutoff);
    expect(await nft.ownerOf(204)).to.equal(alice.address);
  });

  it('never lends a position exited while pending and releases it at the same activation cutoff', async function () {
    const fixture = await deployFixture();
    const { alice, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 205, 30n);
    await vault.connect(alice).requestExit(collection, 205);
    const position = await vault.positionOf(collection, 205);

    expect(position.activationAt).to.equal(cutoff);
    expect(position.withdrawableAt).to.equal(cutoff);
    expect(await vault.isLendable(collection, 205)).to.equal(false);
    await time.increaseTo(cutoff);
    expect(await vault.isLendable(collection, 205)).to.equal(false);
    expect(await vault.lifecycleOf(collection, 205)).to.equal(4);
    await vault.connect(alice).withdraw(collection, 205);
    expect(await nft.ownerOf(205)).to.equal(alice.address);
  });

  it('assigns exits at 13:59:59 to that cutoff and exits at 14:00 to the next one', async function () {
    const beforeFixture = await deployFixture();
    const beforeCollection = await beforeFixture.nft.getAddress();
    const activation = await depositBeforeCutoff(beforeFixture, 206);
    await time.increaseTo(activation);
    const boundary = activation + DAY;
    await time.setNextBlockTimestamp(boundary - 1n);
    await beforeFixture.vault.connect(beforeFixture.alice).requestExit(beforeCollection, 206);
    expect((await beforeFixture.vault.positionOf(beforeCollection, 206)).withdrawableAt).to.equal(boundary);

    const exactFixture = await deployFixture();
    const exactCollection = await exactFixture.nft.getAddress();
    const exactActivation = await depositBeforeCutoff(exactFixture, 207);
    await time.increaseTo(exactActivation);
    const exactBoundary = exactActivation + DAY;
    await time.setNextBlockTimestamp(exactBoundary);
    await exactFixture.vault.connect(exactFixture.alice).requestExit(exactCollection, 207);
    expect((await exactFixture.vault.positionOf(exactCollection, 207)).withdrawableAt)
      .to.equal(exactBoundary + DAY);
  });

  it('pauses only deposits and never requestExit or a mature withdrawal', async function () {
    const fixture = await deployFixture();
    const { owner, alice, bob, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 208);
    await mintAndApprove(vault, nft, bob, 209);
    await vault.connect(owner).pause();

    await expect(vault.connect(bob).deposit(collection, 209))
      .to.be.revertedWithCustomError(vault, 'EnforcedPause');
    await vault.connect(alice).requestExit(collection, 208);
    await time.increaseTo(cutoff);
    await vault.connect(alice).withdraw(collection, 208);
    expect(await nft.ownerOf(208)).to.equal(alice.address);
  });

  it('starts a fresh epoch and activation wait after every complete exit and re-entry', async function () {
    const fixture = await deployFixture();
    const { alice, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 210);
    await vault.connect(alice).requestExit(collection, 210);
    await time.increaseTo(cutoff);
    await vault.connect(alice).withdraw(collection, 210);
    await nft.connect(alice).approve(await vault.getAddress(), 210);
    await vault.connect(alice).deposit(collection, 210);

    expect(await vault.depositEpochOf(collection, 210)).to.equal(2);
    expect(await vault.totalDepositEpochs(collection, 210)).to.equal(2);
    expect(await vault.lifecycleOf(collection, 210)).to.equal(1);
  });

  it('rejects duplicate deposits, unauthorized exits and duplicate exit requests per asset', async function () {
    const fixture = await deployFixture();
    const { owner, alice, bob, vault, nft } = fixture;
    const collection = await nft.getAddress();
    await depositBeforeCutoff(fixture, 217);

    await expect(vault.connect(alice).deposit(collection, 217))
      .to.be.revertedWithCustomError(vault, 'PositionAlreadyExists');
    await expect(vault.connect(bob).requestExit(collection, 217))
      .to.be.revertedWithCustomError(vault, 'NotBeneficialOwner')
      .withArgs(bob.address, alice.address);
    await vault.connect(alice).requestExit(collection, 217);
    await expect(vault.connect(alice).requestExit(collection, 217))
      .to.be.revertedWithCustomError(vault, 'ExitAlreadyRequested');
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 217, alice.address))
      .to.be.revertedWithCustomError(vault, 'RegisteredPosition');
  });

  it('blocks new entries after delisting while preserving exit and withdrawal', async function () {
    const fixture = await deployFixture();
    const { owner, alice, bob, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 218);
    await mintAndApprove(vault, nft, bob, 219);
    await vault.connect(owner).setCollectionAllowed(collection, false);

    await expect(vault.connect(bob).deposit(collection, 219))
      .to.be.revertedWithCustomError(vault, 'CollectionNotAllowed');
    await vault.connect(alice).requestExit(collection, 218);
    await time.increaseTo(cutoff);
    await vault.connect(alice).withdraw(collection, 218);
    expect(await nft.ownerOf(218)).to.equal(alice.address);
  });

  it('schedules a 14:00 to 18:00 change as a four-hour transition with consecutive IDs', async function () {
    const { owner, vault } = await deployFixture();
    const effectiveAt = await nextInitialCutoff();
    const firstCutoffAt = effectiveAt + 4n * 60n * 60n;
    const previous = await vault.periodAt(effectiveAt);

    await expect(vault.connect(owner).scheduleCalendarVersion(effectiveAt, firstCutoffAt))
      .to.emit(vault, 'CalendarVersionScheduled')
      .withArgs(2, effectiveAt, firstCutoffAt, previous.periodId, 18 * 60 * 60);
    const transition = await vault.periodAt(effectiveAt);
    const next = await vault.periodAt(firstCutoffAt);

    expect(transition.calendarVersion).to.equal(2);
    expect(transition.startsAt).to.equal(effectiveAt);
    expect(transition.endsAt).to.equal(firstCutoffAt);
    expect(transition.periodId).to.equal(previous.periodId);
    expect(next.startsAt).to.equal(firstCutoffAt);
    expect(next.endsAt).to.equal(firstCutoffAt + DAY);
    expect(next.periodId).to.equal(transition.periodId + 1n);
  });

  it('supports a 14:00 to 10:00 change and multiple future append-only versions', async function () {
    const { owner, vault } = await deployFixture();
    const firstEffective = await nextInitialCutoff();
    const tenUtcCutoff = firstEffective + 20n * 60n * 60n;
    await vault.connect(owner).scheduleCalendarVersion(firstEffective, tenUtcCutoff);
    expect((await vault.periodAt(firstEffective)).endsAt).to.equal(tenUtcCutoff);

    const secondEffective = tenUtcCutoff + DAY;
    const fourteenUtcCutoff = secondEffective + 4n * 60n * 60n;
    await vault.connect(owner).scheduleCalendarVersion(secondEffective, fourteenUtcCutoff);

    expect(await vault.calendarVersionCount()).to.equal(3);
    expect(await vault.calendarVersionAt(secondEffective - 1n)).to.equal(2);
    expect(await vault.calendarVersionAt(secondEffective)).to.equal(3);
    const secondTransition = await vault.periodAt(secondEffective);
    expect(secondTransition.endsAt).to.equal(fourteenUtcCutoff);
    expect((await vault.periodAt(fourteenUtcCutoff)).periodId)
      .to.equal(secondTransition.periodId + 1n);
  });

  it('selects and joins dozens of future calendar versions with logarithmic lookup semantics', async function () {
    const { owner, vault } = await deployFixture();
    const scheduled = [];
    let effectiveAt = await nextInitialCutoff();

    for (let version = 2; version <= 25; version += 1) {
      const transitionDuration = version % 2 === 0 ? 4n * 60n * 60n : 20n * 60n * 60n;
      const firstCutoffAt = effectiveAt + transitionDuration;
      await vault.connect(owner).scheduleCalendarVersion(effectiveAt, firstCutoffAt);
      scheduled.push({ version: BigInt(version), effectiveAt, firstCutoffAt });
      effectiveAt = firstCutoffAt + DAY;
    }

    expect(await vault.calendarVersionCount()).to.equal(25);
    for (const item of scheduled) {
      expect(await vault.calendarVersionAt(item.effectiveAt - 1n)).to.equal(item.version - 1n);
      expect(await vault.calendarVersionAt(item.effectiveAt)).to.equal(item.version);

      const before = await vault.periodAt(item.effectiveAt - 1n);
      const transition = await vault.periodAt(item.effectiveAt);
      const after = await vault.periodAt(item.firstCutoffAt);
      expect(before.endsAt).to.equal(item.effectiveAt);
      expect(transition.periodId).to.equal(before.periodId + 1n);
      expect(transition.endsAt).to.equal(item.firstCutoffAt);
      expect(after.periodId).to.equal(transition.periodId + 1n);
    }
  });

  it('rejects unauthorized, past, non-boundary and invalid transition schedules', async function () {
    const { owner, alice, vault } = await deployFixture();
    const effectiveAt = await nextInitialCutoff();

    await expect(vault.connect(alice).scheduleCalendarVersion(effectiveAt, effectiveAt + 1n))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await expect(vault.connect(owner).scheduleCalendarVersion(BigInt(await time.latest()), effectiveAt))
      .to.be.revertedWithCustomError(vault, 'InvalidCalendarEffectiveAt');
    await expect(vault.connect(owner).scheduleCalendarVersion(effectiveAt + 1n, effectiveAt + 2n))
      .to.be.revertedWithCustomError(vault, 'InvalidCalendarBoundary');
    await expect(vault.connect(owner).scheduleCalendarVersion(effectiveAt, effectiveAt))
      .to.be.revertedWithCustomError(vault, 'InvalidFirstCutoff');
    await expect(vault.connect(owner).scheduleCalendarVersion(effectiveAt, effectiveAt + DAY + 1n))
      .to.be.revertedWithCustomError(vault, 'InvalidFirstCutoff');
    await expect(vault.calendarVersion(0))
      .to.be.revertedWithCustomError(vault, 'InvalidCalendarVersion');
  });

  it('never rewrites an existing withdrawal promise and applies the new cutoff to later exits', async function () {
    const fixture = await deployFixture();
    const { owner, alice, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const effectiveAt = await depositBeforeCutoff(fixture, 211, 40n);
    await vault.connect(alice).requestExit(collection, 211);
    expect((await vault.positionOf(collection, 211)).withdrawableAt).to.equal(effectiveAt);

    const newCutoff = effectiveAt + 4n * 60n * 60n;
    await vault.connect(owner).scheduleCalendarVersion(effectiveAt, newCutoff);
    expect((await vault.positionOf(collection, 211)).withdrawableAt).to.equal(effectiveAt);

    await time.increaseTo(effectiveAt);
    await mintAndApprove(vault, nft, alice, 212);
    await vault.connect(alice).deposit(collection, 212);
    await vault.connect(alice).requestExit(collection, 212);
    const laterPosition = await vault.positionOf(collection, 212);
    expect(laterPosition.activationAt).to.equal(newCutoff);
    expect(laterPosition.withdrawableAt).to.equal(newCutoff);
    expect(laterPosition.exitCalendarVersion).to.equal(2);
  });

  it('allows only the owner to advance an existing promise and never to maintain or delay it', async function () {
    const fixture = await deployFixture();
    const { owner, alice, vault, nft } = fixture;
    const collection = await nft.getAddress();
    const cutoff = await depositBeforeCutoff(fixture, 213);
    await vault.connect(alice).requestExit(collection, 213);
    const earlier = cutoff - 5n;

    await expect(vault.connect(alice).advanceWithdrawableAt(collection, 213, earlier))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await expect(vault.connect(owner).advanceWithdrawableAt(collection, 213, cutoff))
      .to.be.revertedWithCustomError(vault, 'InvalidWithdrawableAtAdvance');
    await expect(vault.connect(owner).advanceWithdrawableAt(collection, 213, cutoff + 1n))
      .to.be.revertedWithCustomError(vault, 'InvalidWithdrawableAtAdvance');
    await expect(vault.connect(owner).advanceWithdrawableAt(collection, 213, 0))
      .to.be.revertedWithCustomError(vault, 'InvalidWithdrawableAtAdvance');
    await expect(vault.connect(owner).advanceWithdrawableAt(collection, 213, earlier))
      .to.emit(vault, 'WithdrawableAtAdvanced')
      .withArgs(collection, 213, alice.address, 1, cutoff, earlier);
    expect((await vault.positionOf(collection, 213)).withdrawableAt).to.equal(earlier);
  });

  it('rejects direct safe transfers and recovers only unregistered unsafe transfers', async function () {
    const { owner, alice, bob, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();
    await nft.mint(alice.address, 214);
    await expect(
      nft.connect(alice)['safeTransferFrom(address,address,uint256)'](
        alice.address,
        await vault.getAddress(),
        214,
      ),
    ).to.be.revertedWithCustomError(vault, 'UnexpectedERC721Transfer');

    await nft.connect(alice).transferFrom(alice.address, await vault.getAddress(), 214);
    await expect(vault.connect(alice).recoverUntrackedERC721(collection, 214, alice.address))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 214, alice.address))
      .to.emit(vault, 'UntrackedERC721Recovered');
    expect(await nft.ownerOf(214)).to.equal(alice.address);

    await nft.connect(alice).approve(await vault.getAddress(), 214);
    await vault.connect(alice).deposit(collection, 214);
    await expect(vault.connect(owner).recoverUntrackedERC721(collection, 214, bob.address))
      .to.be.revertedWithCustomError(vault, 'RegisteredPosition');
  });

  it('rejects false custody and rolls back a false release from a malicious collection', async function () {
    const { owner, alice, vault } = await deployFixture();
    const CallbackOnly = await ethers.getContractFactory('CallbackOnlyERC721');
    const nft = await CallbackOnly.deploy();
    const collection = await nft.getAddress();
    await vault.connect(owner).setCollectionAllowed(collection, true);
    await mintAndApprove(vault, nft, alice, 215);
    await expect(vault.connect(alice).deposit(collection, 215))
      .to.be.revertedWithCustomError(vault, 'CustodyNotReceived');

    await nft.setCallbackOnly(false);
    await vault.connect(alice).deposit(collection, 215);
    await vault.connect(alice).requestExit(collection, 215);
    await nft.setCallbackOnly(true);
    const withdrawableAt = (await vault.positionOf(collection, 215)).withdrawableAt;
    await time.increaseTo(withdrawableAt);
    await expect(vault.connect(alice).withdraw(collection, 215))
      .to.be.revertedWithCustomError(vault, 'CustodyNotReleased');
    expect(await nft.ownerOf(215)).to.equal(await vault.getAddress());
    expect(await vault.beneficialOwnerOf(collection, 215)).to.equal(alice.address);
  });

  it('supports contract-wallet exits and rejects callback reentrancy from a hostile collection', async function () {
    const { owner, vault } = await deployFixture();
    const ReentrantCollection = await ethers.getContractFactory('ReentrantTransferERC721');
    const nft = await ReentrantCollection.deploy();
    const collection = await nft.getAddress();
    await vault.connect(owner).setCollectionAllowed(collection, true);
    await nft.setCallbackFrom(await vault.getAddress());
    const Receiver = await ethers.getContractFactory('ReentrantNftReceiver');
    const receiver = await Receiver.deploy(await vault.getAddress(), collection);
    const receiverAddress = await receiver.getAddress();
    await nft.mint(receiverAddress, 216);
    await receiver.deposit(216);
    await receiver.requestExit(216);
    const withdrawableAt = (await vault.positionOf(collection, 216)).withdrawableAt;
    await time.increaseTo(withdrawableAt);
    await receiver.withdraw(216);

    expect(await receiver.reentryAttempted()).to.equal(true);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await receiver.reentryErrorSelector())
      .to.equal(ethers.id('ReentrancyGuardReentrantCall()').slice(0, 10));
    expect(await receiver.beneficialOwnerObservedDuringCallback()).to.equal(ethers.ZeroAddress);
    expect(await nft.ownerOf(216)).to.equal(receiverAddress);
  });

  it('uses two-step ownership, disables renunciation and validates collection administration', async function () {
    const { owner, alice, nextOwner, Vault, vault, nft } = await deployFixture();
    const collection = await nft.getAddress();

    await expect(vault.connect(alice).setCollectionAllowed(collection, false))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await expect(vault.connect(owner).setCollectionAllowed(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(vault, 'InvalidCollection');
    await expect(vault.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(vault, 'OwnershipRenounceDisabled');
    await vault.connect(owner).transferOwnership(nextOwner.address);
    await expect(vault.connect(nextOwner).pause())
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
    await vault.connect(nextOwner).acceptOwnership();
    await vault.connect(nextOwner).pause();
    expect(await vault.paused()).to.equal(true);
    await expect(Vault.deploy(ethers.ZeroAddress, 86400))
      .to.be.revertedWithCustomError(vault, 'OwnableInvalidOwner');
  });
});
