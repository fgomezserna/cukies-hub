const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { generateRewardsMerkle } = require('../scripts/lib/rewards-merkle.cjs');

describe('RewardsDistributor', function () {
  async function deployDistributorFixture(funding = ethers.parseEther('1000')) {
    const [owner, alice, bob, other, recipient] = await ethers.getSigners();
    const UKIToken = await ethers.getContractFactory('UKIToken');
    const uki = await UKIToken.deploy(owner.address, owner.address, ethers.parseEther('10000'));
    const RewardsDistributor = await ethers.getContractFactory('RewardsDistributor');
    const distributor = await RewardsDistributor.deploy(await uki.getAddress(), owner.address);
    if (funding > 0n) {
      await uki.transfer(await distributor.getAddress(), funding);
    }

    return { owner, alice, bob, other, recipient, uki, distributor, RewardsDistributor };
  }

  async function buildManifest(distributor, periodId, allocations, domainOverrides = {}) {
    const network = await ethers.provider.getNetwork();
    return generateRewardsMerkle({
      periodId,
      chainId: Number(network.chainId),
      distributorAddress: await distributor.getAddress(),
      metadata: `ipfs://cukies-rewards/${periodId}`,
      allocations: allocations.map(([walletAddress, amountRaw]) => ({ walletAddress, amountRaw })),
      ...domainOverrides,
    });
  }

  async function publishManifest(distributor, manifest, startsAt, expiresAt, totalAllocatedRaw) {
    const totalAllocated = totalAllocatedRaw ?? manifest.totalAllocatedRaw;
    return distributor.publishBatch(
      manifest.batchId,
      manifest.merkleRoot,
      manifest.canonicalInputHash,
      manifest.metadataHash,
      totalAllocated,
      startsAt,
      expiresAt
    );
  }

  function allocationFor(manifest, walletAddress) {
    return manifest.allocations.find(
      (allocation) => allocation.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
  }

  it('publishes a funded immutable batch and reserves the complete allocation', async function () {
    const { owner, alice, bob, other, distributor } = await deployDistributorFixture();
    const manifest = await buildManifest(distributor, 'rewards-2026-w27', [
      [alice.address, ethers.parseEther('40').toString()],
      [bob.address, ethers.parseEther('60').toString()],
    ]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;

    await expect(publishManifest(distributor, manifest, startsAt, expiresAt))
      .to.emit(distributor, 'BatchPublished')
      .withArgs(
        manifest.batchId,
        manifest.merkleRoot,
        manifest.canonicalInputHash,
        manifest.metadataHash,
        ethers.parseEther('100'),
        startsAt,
        expiresAt
      );

    const batch = await distributor.batches(manifest.batchId);
    expect(batch.merkleRoot).to.equal(manifest.merkleRoot);
    expect(batch.inputHash).to.equal(manifest.canonicalInputHash);
    expect(batch.metadataHash).to.equal(manifest.metadataHash);
    expect(batch.totalAllocated).to.equal(ethers.parseEther('100'));
    expect(batch.totalClaimed).to.equal(0);
    expect(batch.startsAt).to.equal(startsAt);
    expect(batch.expiresAt).to.equal(expiresAt);
    expect(batch.closed).to.equal(false);
    expect(await distributor.totalReserved()).to.equal(ethers.parseEther('100'));
    expect(await distributor.freeBalance()).to.equal(ethers.parseEther('900'));

    await expect(publishManifest(distributor.connect(other), manifest, startsAt, expiresAt))
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(publishManifest(distributor.connect(owner), manifest, startsAt, expiresAt))
      .to.be.revertedWithCustomError(distributor, 'BatchAlreadyExists');
  });

  it('rejects invalid batch definitions', async function () {
    const { alice, distributor } = await deployDistributorFixture();
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    const root = ethers.id('root');
    const inputHash = ethers.id('input');
    const metadataHash = ethers.id('metadata');

    await expect(distributor.publishBatch(
      ethers.ZeroHash, root, inputHash, metadataHash, 1, startsAt, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidBatchId');
    await expect(distributor.publishBatch(
      ethers.id('zero-root'), ethers.ZeroHash, inputHash, metadataHash, 1, startsAt, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidMerkleRoot');
    await expect(distributor.publishBatch(
      ethers.id('zero-input'), root, ethers.ZeroHash, metadataHash, 1, startsAt, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidInputHash');
    await expect(distributor.publishBatch(
      ethers.id('zero-metadata'), root, inputHash, ethers.ZeroHash, 1, startsAt, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidMetadataHash');
    await expect(distributor.publishBatch(
      ethers.id('zero-amount'), root, inputHash, metadataHash, 0, startsAt, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidAmount');
    await expect(distributor.publishBatch(
      ethers.id('zero-start'), root, inputHash, metadataHash, 1, 0, expiresAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidBatchWindow');
    await expect(distributor.publishBatch(
      ethers.id('reversed-window'), root, inputHash, metadataHash, 1, expiresAt, startsAt
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidBatchWindow');
    await expect(distributor.publishBatch(
      ethers.id('expired-window'), root, inputHash, metadataHash, 1, now - 100n, now - 1n
    ))
      .to.be.revertedWithCustomError(distributor, 'InvalidBatchWindow');

    expect(await distributor.claimed(ethers.id('unknown'), alice.address)).to.equal(false);
  });

  it('prevents insufficient funding and cross-batch overcommitment', async function () {
    const { distributor } = await deployDistributorFixture(ethers.parseEther('100'));
    const now = BigInt(await time.latest());
    const startsAt = now + 1n;
    const expiresAt = now + 1_000n;

    await distributor.publishBatch(
      ethers.id('batch-a'),
      ethers.id('root-a'),
      ethers.id('input-a'),
      ethers.id('metadata-a'),
      ethers.parseEther('60'),
      startsAt,
      expiresAt
    );
    await expect(distributor.publishBatch(
      ethers.id('batch-b'),
      ethers.id('root-b'),
      ethers.id('input-b'),
      ethers.id('metadata-b'),
      ethers.parseEther('41'),
      startsAt,
      expiresAt
    )).to.be.revertedWithCustomError(distributor, 'InsufficientFreeBalance');

    await distributor.publishBatch(
      ethers.id('batch-c'),
      ethers.id('root-c'),
      ethers.id('input-c'),
      ethers.id('metadata-c'),
      ethers.parseEther('40'),
      startsAt,
      expiresAt
    );
    expect(await distributor.totalReserved()).to.equal(ethers.parseEther('100'));
    expect(await distributor.freeBalance()).to.equal(0);
  });

  it('consumes generated proofs for multiple wallets and releases reservations on claim', async function () {
    const { alice, bob, uki, distributor } = await deployDistributorFixture(ethers.parseEther('300'));
    const manifest = await buildManifest(distributor, 'rewards-interop', [
      [bob.address, ethers.parseEther('200').toString()],
      [alice.address, ethers.parseEther('100').toString()],
    ]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);

    const aliceAllocation = allocationFor(manifest, alice.address);
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      aliceAllocation.amountRaw,
      aliceAllocation.proof
    ))
      .to.emit(distributor, 'RewardClaimed')
      .withArgs(manifest.batchId, alice.address, ethers.parseEther('100'));
    expect(await distributor.claimed(manifest.batchId, alice.address)).to.equal(true);
    expect(await distributor.totalReserved()).to.equal(ethers.parseEther('200'));

    const bobAllocation = allocationFor(manifest, bob.address);
    await distributor.connect(bob).claim(manifest.batchId, bobAllocation.amountRaw, bobAllocation.proof);

    const batch = await distributor.batches(manifest.batchId);
    expect(batch.totalClaimed).to.equal(ethers.parseEther('300'));
    expect(await distributor.totalReserved()).to.equal(0);
    expect(await uki.balanceOf(alice.address)).to.equal(ethers.parseEther('100'));
    expect(await uki.balanceOf(bob.address)).to.equal(ethers.parseEther('200'));
  });

  it('consumes every generated proof from an odd three-wallet tree on-chain', async function () {
    const { alice, bob, other, uki, distributor } = await deployDistributorFixture(600n);
    const manifest = await buildManifest(distributor, 'rewards-odd-tree', [
      [alice.address, '100'],
      [bob.address, '200'],
      [other.address, '300'],
    ]);
    const proofLengths = manifest.allocations.map((allocation) => allocation.proof.length);
    expect(proofLengths).to.include.members([1, 2]);

    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);

    for (const account of [alice, bob, other]) {
      const allocation = allocationFor(manifest, account.address);
      await expect(distributor.connect(account).claim(
        manifest.batchId,
        allocation.amountRaw,
        allocation.proof
      ))
        .to.emit(distributor, 'RewardClaimed')
        .withArgs(manifest.batchId, account.address, BigInt(allocation.amountRaw));
      expect(await distributor.claimed(manifest.batchId, account.address)).to.equal(true);
    }

    expect((await distributor.batches(manifest.batchId)).totalClaimed).to.equal(600);
    expect(await distributor.totalReserved()).to.equal(0);
    expect(await uki.balanceOf(await distributor.getAddress())).to.equal(0);
  });

  it('tracks the same wallet independently across multiple batches', async function () {
    const { alice, uki, distributor } = await deployDistributorFixture(150n);
    const firstManifest = await buildManifest(distributor, 'rewards-multi-batch-a', [[alice.address, '100']]);
    const secondManifest = await buildManifest(distributor, 'rewards-multi-batch-b', [[alice.address, '50']]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, firstManifest, startsAt, expiresAt);
    await publishManifest(distributor, secondManifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);

    await distributor.connect(alice).claim(
      firstManifest.batchId,
      firstManifest.allocations[0].amountRaw,
      firstManifest.allocations[0].proof
    );
    await distributor.connect(alice).claim(
      secondManifest.batchId,
      secondManifest.allocations[0].amountRaw,
      secondManifest.allocations[0].proof
    );

    expect(await distributor.claimed(firstManifest.batchId, alice.address)).to.equal(true);
    expect(await distributor.claimed(secondManifest.batchId, alice.address)).to.equal(true);
    expect(await distributor.totalReserved()).to.equal(0);
    expect(await uki.balanceOf(alice.address)).to.equal(150);
  });

  it('rejects proofs for the wrong wallet, amount, proof or batch', async function () {
    const { alice, bob, other, distributor } = await deployDistributorFixture();
    const manifest = await buildManifest(distributor, 'rewards-proof-domain', [
      [alice.address, '100'],
      [bob.address, '200'],
    ]);
    const otherManifest = await buildManifest(distributor, 'rewards-other-batch', [[alice.address, '100']]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await publishManifest(distributor, otherManifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);

    const aliceAllocation = allocationFor(manifest, alice.address);
    await expect(distributor.connect(other).claim(
      manifest.batchId,
      aliceAllocation.amountRaw,
      aliceAllocation.proof
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      '101',
      aliceAllocation.proof
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      aliceAllocation.amountRaw,
      [ethers.id('tampered-proof')]
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');
    await expect(distributor.connect(alice).claim(
      otherManifest.batchId,
      aliceAllocation.amountRaw,
      aliceAllocation.proof
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');
    await expect(distributor.connect(alice).claim(ethers.id('missing'), 1, []))
      .to.be.revertedWithCustomError(distributor, 'BatchNotFound');
    await expect(distributor.connect(alice).claim(manifest.batchId, 0, []))
      .to.be.revertedWithCustomError(distributor, 'InvalidAmount');
  });

  it('rejects generated proofs from another chain or distributor domain', async function () {
    const { alice, bob, other, distributor } = await deployDistributorFixture();
    const allocations = [
      [alice.address, '100'],
      [bob.address, '200'],
    ];
    const network = await ethers.provider.getNetwork();
    const manifest = await buildManifest(distributor, 'rewards-domain-separation', allocations);
    const wrongChainManifest = await buildManifest(
      distributor,
      'rewards-domain-separation',
      allocations,
      { chainId: Number(network.chainId) + 1 }
    );
    const wrongDistributorManifest = await buildManifest(
      distributor,
      'rewards-domain-separation',
      allocations,
      { distributorAddress: other.address }
    );
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);

    const wrongChainAllocation = allocationFor(wrongChainManifest, alice.address);
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      wrongChainAllocation.amountRaw,
      wrongChainAllocation.proof
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');

    const wrongDistributorAllocation = allocationFor(wrongDistributorManifest, alice.address);
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      wrongDistributorAllocation.amountRaw,
      wrongDistributorAllocation.proof
    )).to.be.revertedWithCustomError(distributor, 'InvalidProof');
  });

  it('enforces the claim window, one claim per wallet and expired batch closure', async function () {
    const { alice, distributor } = await deployDistributorFixture();
    const manifest = await buildManifest(distributor, 'rewards-lifecycle', [[alice.address, '100']]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 500n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    const allocation = manifest.allocations[0];

    await expect(distributor.connect(alice).claim(manifest.batchId, allocation.amountRaw, allocation.proof))
      .to.be.revertedWithCustomError(distributor, 'BatchNotStarted');
    await time.setNextBlockTimestamp(startsAt);
    await distributor.connect(alice).claim(manifest.batchId, allocation.amountRaw, allocation.proof);
    await expect(distributor.connect(alice).claim(manifest.batchId, allocation.amountRaw, allocation.proof))
      .to.be.revertedWithCustomError(distributor, 'AlreadyClaimed');

    await time.setNextBlockTimestamp(expiresAt);
    await expect(distributor.closeExpiredBatch(manifest.batchId))
      .to.be.revertedWithCustomError(distributor, 'BatchNotExpired');
    await time.increaseTo(expiresAt + 1n);
    await expect(distributor.closeExpiredBatch(manifest.batchId))
      .to.emit(distributor, 'BatchClosed')
      .withArgs(manifest.batchId, 0);
    await expect(distributor.closeExpiredBatch(manifest.batchId))
      .to.be.revertedWithCustomError(distributor, 'BatchAlreadyClosed');
    await expect(distributor.connect(alice).claim(manifest.batchId, allocation.amountRaw, allocation.proof))
      .to.be.revertedWithCustomError(distributor, 'BatchClosedForClaims');
  });

  it('rejects unclaimed rewards after expiry and releases them only when the owner closes', async function () {
    const { alice, other, distributor } = await deployDistributorFixture(100n);
    const manifest = await buildManifest(distributor, 'rewards-expired', [[alice.address, '100']]);
    const now = BigInt(await time.latest());
    const startsAt = now + 10n;
    const expiresAt = startsAt + 10n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await time.increaseTo(expiresAt + 1n);

    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      manifest.allocations[0].amountRaw,
      manifest.allocations[0].proof
    )).to.be.revertedWithCustomError(distributor, 'BatchExpired');
    await expect(distributor.connect(other).closeExpiredBatch(manifest.batchId))
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount');

    await distributor.closeExpiredBatch(manifest.batchId);
    expect(await distributor.totalReserved()).to.equal(0);
    expect(await distributor.freeBalance()).to.equal(100);
    expect((await distributor.batches(manifest.batchId)).totalClaimed).to.equal(0);
  });

  it('allows excess recovery without consuming reserved rewards', async function () {
    const { alice, other, recipient, uki, distributor } =
      await deployDistributorFixture(ethers.parseEther('200'));
    const manifest = await buildManifest(distributor, 'rewards-recovery', [
      [alice.address, ethers.parseEther('150').toString()],
    ]);
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);

    await expect(distributor.connect(other).recoverExcess(recipient.address, 1))
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount');
    await expect(distributor.recoverExcess(ethers.ZeroAddress, 1))
      .to.be.revertedWithCustomError(distributor, 'InvalidRecipient');
    await expect(distributor.recoverExcess(recipient.address, 0))
      .to.be.revertedWithCustomError(distributor, 'InvalidAmount');
    await expect(distributor.recoverExcess(recipient.address, ethers.parseEther('50.000000000000000001')))
      .to.be.revertedWithCustomError(distributor, 'InsufficientFreeBalance');

    await expect(distributor.recoverExcess(recipient.address, ethers.parseEther('50')))
      .to.emit(distributor, 'ExcessRecovered')
      .withArgs(recipient.address, ethers.parseEther('50'));
    expect(await distributor.totalReserved()).to.equal(ethers.parseEther('150'));
    expect(await distributor.freeBalance()).to.equal(0);
    expect(await uki.balanceOf(await distributor.getAddress())).to.equal(ethers.parseEther('150'));

    await time.setNextBlockTimestamp(startsAt);
    await distributor.connect(alice).claim(
      manifest.batchId,
      manifest.allocations[0].amountRaw,
      manifest.allocations[0].proof
    );
    expect(await uki.balanceOf(alice.address)).to.equal(ethers.parseEther('150'));
  });

  it('keeps claims paused while owner batch and excess administration remain available', async function () {
    const { owner, alice, other, recipient, distributor } = await deployDistributorFixture(200n);
    const manifest = await buildManifest(distributor, 'rewards-paused', [[alice.address, '100']]);
    const secondManifest = await buildManifest(
      distributor,
      'rewards-published-while-paused',
      [[other.address, '50']]
    );
    const now = BigInt(await time.latest());
    const startsAt = now + 100n;
    const expiresAt = startsAt + 1_000n;
    await publishManifest(distributor, manifest, startsAt, expiresAt);
    await time.setNextBlockTimestamp(startsAt);
    await distributor.connect(owner).pause();

    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      manifest.allocations[0].amountRaw,
      manifest.allocations[0].proof
    )).to.be.revertedWithCustomError(distributor, 'EnforcedPause');
    await expect(distributor.connect(other).unpause())
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount');

    await publishManifest(distributor, secondManifest, startsAt, expiresAt);
    await distributor.recoverExcess(recipient.address, 50);
    await distributor.connect(owner).unpause();
    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      manifest.allocations[0].amountRaw,
      manifest.allocations[0].proof
    )).to.emit(distributor, 'RewardClaimed');
  });

  it('guards against a root whose valid claims exceed the owner-declared allocation', async function () {
    const { alice, distributor } = await deployDistributorFixture(100n);
    const manifest = await buildManifest(distributor, 'rewards-mismatched-total', [[alice.address, '100']]);
    const now = BigInt(await time.latest());
    const startsAt = now + 10n;
    const expiresAt = startsAt + 100n;
    await publishManifest(distributor, manifest, startsAt, expiresAt, '50');
    await time.setNextBlockTimestamp(startsAt);

    await expect(distributor.connect(alice).claim(
      manifest.batchId,
      manifest.allocations[0].amountRaw,
      manifest.allocations[0].proof
    )).to.be.revertedWithCustomError(distributor, 'BatchAllocationExceeded');
    expect(await distributor.claimed(manifest.batchId, alice.address)).to.equal(false);
    expect(await distributor.totalReserved()).to.equal(50);
  });

  it('transfers ownership in two steps without giving the pending owner early control', async function () {
    const { owner, other, recipient, distributor } = await deployDistributorFixture();

    await expect(distributor.connect(owner).transferOwnership(other.address))
      .to.emit(distributor, 'OwnershipTransferStarted')
      .withArgs(owner.address, other.address);
    expect(await distributor.owner()).to.equal(owner.address);
    expect(await distributor.pendingOwner()).to.equal(other.address);

    await expect(distributor.connect(recipient).acceptOwnership())
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount')
      .withArgs(recipient.address);
    await expect(distributor.connect(other).pause())
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(distributor.connect(owner).pause()).to.emit(distributor, 'Paused').withArgs(owner.address);

    await expect(distributor.connect(other).acceptOwnership())
      .to.emit(distributor, 'OwnershipTransferred')
      .withArgs(owner.address, other.address);
    expect(await distributor.owner()).to.equal(other.address);
    expect(await distributor.pendingOwner()).to.equal(ethers.ZeroAddress);

    await expect(distributor.connect(owner).unpause())
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount')
      .withArgs(owner.address);
    await expect(distributor.connect(other).unpause()).to.emit(distributor, 'Unpaused').withArgs(other.address);
  });

  it('disables ownership renunciation and rejects invalid constructor addresses', async function () {
    const { owner, other, uki, distributor, RewardsDistributor } = await deployDistributorFixture();

    await expect(distributor.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(distributor, 'OwnershipRenounceDisabled');
    await expect(distributor.connect(other).pause())
      .to.be.revertedWithCustomError(distributor, 'OwnableUnauthorizedAccount');
    expect(await distributor.owner()).to.equal(owner.address);

    await expect(RewardsDistributor.deploy(ethers.ZeroAddress, owner.address))
      .to.be.revertedWithCustomError(distributor, 'InvalidToken');
    await expect(RewardsDistributor.deploy(await uki.getAddress(), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(distributor, 'OwnableInvalidOwner')
      .withArgs(ethers.ZeroAddress);
  });
});
