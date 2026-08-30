const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('CukiesBridgeEndpoint', function () {
  const TRON = 0;
  const BSC = 1;
  const tronFee = 10_000_000n;
  const bscFee = 25_000_000_000_000n;
  const tokenId = 1000000002279n;
  const metadata = {
    typeId: 5n,
    generation: 1n,
    skills: [12n, 23n, 34n, 45n, 56n, 67n],
    energy: 88n,
    health: 99n,
  };

  async function deployFixture() {
    const [owner, relayer, alice, bob, treasury, stranger] = await ethers.getSigners();
    const Nft = await ethers.getContractFactory('StagingCukiesNftV2');
    const tronNft = await Nft.deploy(owner.address);
    const bscNft = await Nft.deploy(owner.address);
    await tronNft.mintBridge(alice.address, tokenId, metadata);

    const Endpoint = await ethers.getContractFactory('CukiesBridgeEndpoint');
    const tronEndpoint = await Endpoint.deploy(
      owner.address,
      await tronNft.getAddress(),
      TRON,
      treasury.address,
      tronFee,
    );
    const bscEndpoint = await Endpoint.deploy(
      owner.address,
      await bscNft.getAddress(),
      BSC,
      treasury.address,
      bscFee,
    );

    await tronEndpoint.setRelayer(relayer.address, true);
    await bscEndpoint.setRelayer(relayer.address, true);
    await tronNft.transferOwnership(await tronEndpoint.getAddress());
    await bscNft.transferOwnership(await bscEndpoint.getAddress());

    return {
      owner,
      relayer,
      alice,
      bob,
      treasury,
      stranger,
      tronNft,
      bscNft,
      tronEndpoint,
      bscEndpoint,
    };
  }

  function eventArgs(contract, receipt, eventName) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === eventName) return parsed.args;
      } catch {
        // Logs emitted by the NFT collection belong to a different interface.
      }
    }
    throw new Error(`${eventName} was not emitted`);
  }

  async function requestBridge(endpoint, nft, signer, destinationOwner, destinationNetwork, fee) {
    await nft.connect(signer).approve(await endpoint.getAddress(), tokenId);
    const tx = await endpoint
      .connect(signer)
      .requestBridge(tokenId, destinationOwner, destinationNetwork, { value: fee });
    const receipt = await tx.wait();
    return eventArgs(endpoint, receipt, 'BridgeRequested');
  }

  it('locks on TRON, mints on BSC and releases the original on the return trip', async function () {
    const {
      relayer,
      alice,
      bob,
      treasury,
      tronNft,
      bscNft,
      tronEndpoint,
      bscEndpoint,
    } = await deployFixture();
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    const outbound = await requestBridge(
      tronEndpoint,
      tronNft,
      alice,
      bob.address,
      BSC,
      tronFee,
    );
    const outboundId = outbound.transferId;

    expect(await tronNft.ownerOf(tokenId)).to.equal(await tronEndpoint.getAddress());
    expect(await tronEndpoint.lockedTransferByToken(tokenId)).to.equal(outboundId);
    expect(outbound.metadataHash).to.equal(await tronEndpoint.hashMetadata(metadata));

    const alteredMetadata = { ...metadata, energy: metadata.energy + 1n };
    await expect(
      bscEndpoint
        .connect(relayer)
        .completeBridge(
          outboundId,
          tokenId,
          bob.address,
          TRON,
          outbound.metadataHash,
          alteredMetadata,
        ),
    ).to.be.revertedWithCustomError(bscEndpoint, 'MetadataHashMismatch');
    expect(await bscEndpoint.processedTransfers(outboundId)).to.equal(false);

    await expect(
      bscEndpoint
        .connect(relayer)
        .completeBridge(
          outboundId,
          tokenId,
          bob.address,
          TRON,
          outbound.metadataHash,
          metadata,
        ),
    )
      .to.emit(bscEndpoint, 'BridgeCompleted')
      .withArgs(
        outboundId,
        tokenId,
        bob.address,
        TRON,
        BSC,
        true,
        await bscEndpoint.hashMetadata(metadata),
        anyValue,
      );

    expect(await bscNft.ownerOf(tokenId)).to.equal(bob.address);
    const bridgedMetadata = await bscNft.bridgeMetadata(tokenId);
    expect(bridgedMetadata.typeId).to.equal(metadata.typeId);
    expect(bridgedMetadata.generation).to.equal(metadata.generation);
    expect([...bridgedMetadata.skills]).to.deep.equal(metadata.skills);
    expect(bridgedMetadata.energy).to.equal(metadata.energy);
    expect(bridgedMetadata.health).to.equal(metadata.health);
    expect((await bscEndpoint.tokenMetadata(tokenId))[1]).to.equal(
      await bscEndpoint.hashMetadata(metadata),
    );

    const inbound = await requestBridge(
      bscEndpoint,
      bscNft,
      bob,
      alice.address,
      TRON,
      bscFee,
    );
    const inboundId = inbound.transferId;
    expect(inbound.metadataHash).to.equal(await bscEndpoint.hashMetadata(metadata));

    await expect(
      tronEndpoint
        .connect(relayer)
        .completeBridge(
          inboundId,
          tokenId,
          alice.address,
          BSC,
          inbound.metadataHash,
          metadata,
        ),
    )
      .to.emit(tronEndpoint, 'BridgeCompleted')
      .withArgs(
        inboundId,
        tokenId,
        alice.address,
        BSC,
        TRON,
        false,
        await tronEndpoint.hashMetadata(metadata),
        anyValue,
      );

    expect(await tronNft.ownerOf(tokenId)).to.equal(alice.address);
    expect(await bscNft.ownerOf(tokenId)).to.equal(await bscEndpoint.getAddress());
    expect(await tronEndpoint.lockedTransferByToken(tokenId)).to.equal(ethers.ZeroHash);
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      treasuryBefore + tronFee + bscFee,
    );
  });

  it('rejects replay, unauthorized completion and a destination token outside custody', async function () {
    const {
      relayer,
      alice,
      bob,
      stranger,
      tronNft,
      bscNft,
      tronEndpoint,
      bscEndpoint,
    } = await deployFixture();
    const outbound = await requestBridge(
      tronEndpoint,
      tronNft,
      alice,
      bob.address,
      BSC,
      tronFee,
    );

    await expect(
      bscEndpoint
        .connect(stranger)
        .completeBridge(
          outbound.transferId,
          tokenId,
          bob.address,
          TRON,
          outbound.metadataHash,
          metadata,
        ),
    )
      .to.be.revertedWithCustomError(bscEndpoint, 'UnauthorizedRelayer')
      .withArgs(stranger.address);

    await bscEndpoint
      .connect(relayer)
      .completeBridge(
        outbound.transferId,
        tokenId,
        bob.address,
        TRON,
        outbound.metadataHash,
        metadata,
      );
    await expect(
      bscEndpoint
        .connect(relayer)
        .completeBridge(
          outbound.transferId,
          tokenId,
          bob.address,
          TRON,
          outbound.metadataHash,
          metadata,
        ),
    )
      .to.be.revertedWithCustomError(bscEndpoint, 'TransferAlreadyProcessed')
      .withArgs(outbound.transferId);

    const conflictingId = ethers.keccak256(ethers.toUtf8Bytes('conflicting-transfer'));
    const metadataHash = await bscEndpoint.hashMetadata(metadata);
    await expect(
      bscEndpoint
        .connect(relayer)
        .completeBridge(
          conflictingId,
          tokenId,
          alice.address,
          TRON,
          metadataHash,
          metadata,
        ),
    )
      .to.be.revertedWithCustomError(bscEndpoint, 'DestinationTokenNotInCustody')
      .withArgs(tokenId, bob.address);

    expect(await bscNft.ownerOf(tokenId)).to.equal(bob.address);
  });

  it('fails closed for wrong network, wrong fee, pause and direct safe transfers', async function () {
    const { owner, alice, bob, tronNft, tronEndpoint } = await deployFixture();
    await tronNft.connect(alice).approve(await tronEndpoint.getAddress(), tokenId);

    await expect(
      tronEndpoint.connect(alice).requestBridge(tokenId, bob.address, TRON, { value: tronFee }),
    )
      .to.be.revertedWithCustomError(tronEndpoint, 'InvalidDestinationNetwork')
      .withArgs(TRON);
    await expect(
      tronEndpoint.connect(alice).requestBridge(tokenId, bob.address, BSC, { value: tronFee - 1n }),
    )
      .to.be.revertedWithCustomError(tronEndpoint, 'IncorrectBridgeFee')
      .withArgs(tronFee, tronFee - 1n);

    await tronEndpoint.connect(owner).pause();
    await expect(
      tronEndpoint.connect(alice).requestBridge(tokenId, bob.address, BSC, { value: tronFee }),
    ).to.be.revertedWithCustomError(tronEndpoint, 'EnforcedPause');
    await tronEndpoint.connect(owner).unpause();

    await expect(
      tronNft
        .connect(alice)
        ['safeTransferFrom(address,address,uint256)'](
          alice.address,
          await tronEndpoint.getAddress(),
          tokenId,
        ),
    ).to.be.revertedWithCustomError(tronEndpoint, 'UnexpectedERC721Transfer');
    expect(await tronNft.ownerOf(tokenId)).to.equal(alice.address);
  });

  it('rolls back custody and accounting when the fee recipient rejects native value', async function () {
    const { owner, alice, bob, tronNft, tronEndpoint } = await deployFixture();

    await tronEndpoint.connect(owner).setFeeRecipient(await tronNft.getAddress());
    await tronNft.connect(alice).approve(await tronEndpoint.getAddress(), tokenId);

    await expect(
      tronEndpoint
        .connect(alice)
        .requestBridge(tokenId, bob.address, BSC, { value: tronFee }),
    ).to.be.revertedWithCustomError(tronEndpoint, 'FeeTransferFailed');

    expect(await tronNft.ownerOf(tokenId)).to.equal(alice.address);
    expect(await tronEndpoint.lockedTransferByToken(tokenId)).to.equal(ethers.ZeroHash);
    expect(await tronEndpoint.nextNonce()).to.equal(0n);
  });

  it('only recovers untracked NFTs while paused and never a live bridge position', async function () {
    const { owner, relayer, alice, bob, tronNft, tronEndpoint } = await deployFixture();
    const endpointAddress = await tronEndpoint.getAddress();

    await tronNft.connect(alice).transferFrom(alice.address, endpointAddress, tokenId);
    const untrackedId = ethers.keccak256(ethers.toUtf8Bytes('untracked-transfer'));
    await expect(
      tronEndpoint
        .connect(relayer)
        .completeBridge(
          untrackedId,
          tokenId,
          alice.address,
          BSC,
          await tronEndpoint.hashMetadata(metadata),
          metadata,
        ),
    )
      .to.be.revertedWithCustomError(tronEndpoint, 'DestinationTokenNotTracked')
      .withArgs(tokenId);
    await expect(
      tronEndpoint.connect(owner).recoverUntrackedERC721(
        await tronNft.getAddress(),
        tokenId,
        alice.address,
      ),
    ).to.be.revertedWithCustomError(tronEndpoint, 'ExpectedPause');

    await tronEndpoint.connect(owner).pause();
    await expect(
      tronEndpoint.connect(owner).recoverUntrackedERC721(
        await tronNft.getAddress(),
        tokenId,
        alice.address,
      ),
    )
      .to.emit(tronEndpoint, 'UntrackedERC721Recovered')
      .withArgs(await tronNft.getAddress(), tokenId, alice.address);

    await tronEndpoint.connect(owner).unpause();
    const outbound = await requestBridge(
      tronEndpoint,
      tronNft,
      alice,
      bob.address,
      BSC,
      tronFee,
    );
    await tronEndpoint.connect(owner).pause();
    await expect(
      tronEndpoint.connect(owner).recoverUntrackedERC721(
        await tronNft.getAddress(),
        tokenId,
        alice.address,
      ),
    )
      .to.be.revertedWithCustomError(tronEndpoint, 'TrackedTokenRecoveryForbidden')
      .withArgs(tokenId, outbound.transferId);
  });

  it('guards administration and cannot renounce ownership', async function () {
    const { owner, relayer, stranger, tronEndpoint } = await deployFixture();

    await expect(tronEndpoint.connect(stranger).setBridgePrice(1))
      .to.be.revertedWithCustomError(tronEndpoint, 'OwnableUnauthorizedAccount')
      .withArgs(stranger.address);
    await expect(tronEndpoint.connect(owner).setRelayer(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(tronEndpoint, 'InvalidRelayer');
    await expect(tronEndpoint.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(tronEndpoint, 'OwnershipRenounceDisabled');

    await expect(tronEndpoint.connect(owner).setRelayer(relayer.address, false))
      .to.emit(tronEndpoint, 'RelayerUpdated')
      .withArgs(relayer.address, false);
    expect(await tronEndpoint.relayers(relayer.address)).to.equal(false);
  });
});
