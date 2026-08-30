const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('CukiesMarketplace', function () {
  const FEE_BPS = 1_000;
  const ACTIVE = 1n;
  const SOLD = 2n;
  const CANCELLED = 3n;
  const EXPIRED = 4n;
  const INVALID = 5n;

  async function deployFixture() {
    const [owner, seller, buyer, feeRecipient, outsider, nextOwner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20');
    const uki = await Token.deploy('UKI', 'UKI');
    const usdt = await Token.deploy('Test USDT', 'USDT');
    const wrappedNative = await Token.deploy('Wrapped BNB', 'WBNB');

    const Router = await ethers.getContractFactory('MockPancakeRouter');
    const router = await Router.deploy(await wrappedNative.getAddress());

    const Marketplace = await ethers.getContractFactory('CukiesMarketplace');
    const marketplace = await Marketplace.deploy(
      await uki.getAddress(),
      await router.getAddress(),
      await wrappedNative.getAddress(),
      feeRecipient.address,
      FEE_BPS,
      owner.address,
    );

    const Nft = await ethers.getContractFactory('MockERC721');
    const nft = await Nft.deploy('Cukies Originales', 'CUKI');

    await marketplace.connect(owner).setCollectionAllowed(await nft.getAddress(), true);
    await marketplace.connect(owner).setPaymentTokenAllowed(await usdt.getAddress(), true);
    await router.setRate(await usdt.getAddress(), ethers.parseEther('2'));
    await router.setRate(await wrappedNative.getAddress(), ethers.parseEther('2'));
    await uki.mint(await router.getAddress(), ethers.parseEther('1000000'));

    return {
      owner,
      seller,
      buyer,
      feeRecipient,
      outsider,
      nextOwner,
      uki,
      usdt,
      wrappedNative,
      router,
      marketplace,
      nft,
    };
  }

  async function listToken(fixture, tokenId, price = ethers.parseEther('1000'), lifetime = 3600) {
    const { seller, marketplace, nft } = fixture;
    const collection = await nft.getAddress();
    await nft.mint(seller.address, tokenId);
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    const expiresAt = BigInt(await time.latest()) + BigInt(lifetime);
    await marketplace.connect(seller).createOrder(collection, tokenId, price, expiresAt);
    const orderId = await marketplace.activeOrderIds(collection, tokenId);
    return { orderId, price, expiresAt, collection };
  }

  it('creates an indexable on-chain order only for the approved NFT owner', async function () {
    const fixture = await loadFixture(deployFixture);
    const { owner, seller, buyer, marketplace, nft } = fixture;
    const collection = await nft.getAddress();
    const tokenId = 101;
    const price = ethers.parseEther('1000');
    const expiresAt = BigInt(await time.latest()) + 3600n;

    await nft.mint(seller.address, tokenId);
    await expect(marketplace.connect(buyer).createOrder(collection, tokenId, price, expiresAt))
      .to.be.revertedWithCustomError(marketplace, 'NotTokenOwner')
      .withArgs(buyer.address, seller.address);
    await expect(marketplace.connect(seller).createOrder(collection, tokenId, price, expiresAt))
      .to.be.revertedWithCustomError(marketplace, 'MarketplaceNotApproved');

    await nft.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await expect(marketplace.connect(seller).createOrder(collection, tokenId, price, expiresAt))
      .to.emit(marketplace, 'OrderCreated')
      .withArgs(anyValue, collection, tokenId, seller.address, price, expiresAt, 1, FEE_BPS);

    const orderId = await marketplace.activeOrderIds(collection, tokenId);
    const order = await marketplace.orders(orderId);
    expect(order.seller).to.equal(seller.address);
    expect(order.collection).to.equal(collection);
    expect(order.tokenId).to.equal(tokenId);
    expect(order.ukiPrice).to.equal(price);
    expect(order.nonce).to.equal(1);
    expect(order.feeBps).to.equal(FEE_BPS);
    expect(await marketplace.orderState(orderId)).to.equal(ACTIVE);

    await expect(marketplace.connect(seller).createOrder(collection, tokenId, price, expiresAt + 1n))
      .to.be.revertedWithCustomError(marketplace, 'ActiveOrderExists')
      .withArgs(orderId);

    await marketplace.connect(owner).setCollectionAllowed(collection, false);
    expect(await marketplace.orderState(orderId)).to.equal(INVALID);
  });

  it('settles an exact UKI price to the seller and charges the buyer fee in UKI', async function () {
    const fixture = await loadFixture(deployFixture);
    const { seller, buyer, feeRecipient, uki, marketplace, nft } = fixture;
    const { orderId, price } = await listToken(fixture, 102);
    const fee = ethers.parseEther('100');

    await uki.mint(buyer.address, price + fee);
    await uki.connect(buyer).approve(await marketplace.getAddress(), price + fee);

    await expect(marketplace.connect(buyer).buyWithUki(orderId))
      .to.emit(marketplace, 'OrderFilled')
      .withArgs(
        orderId,
        buyer.address,
        await uki.getAddress(),
        price + fee,
        fee,
        price,
      );

    expect(await uki.balanceOf(seller.address)).to.equal(price);
    expect(await uki.balanceOf(feeRecipient.address)).to.equal(fee);
    expect(await nft.ownerOf(102)).to.equal(buyer.address);
    expect(await marketplace.orderState(orderId)).to.equal(SOLD);
    await expect(marketplace.connect(buyer).buyWithUki(orderId))
      .to.be.revertedWithCustomError(marketplace, 'OrderNotPurchasable')
      .withArgs(SOLD);
  });

  it('buys with USDT through an exact-output swap, refunds surplus and pays the seller exact UKI', async function () {
    const fixture = await loadFixture(deployFixture);
    const { seller, buyer, feeRecipient, uki, usdt, router, marketplace, nft } = fixture;
    const { orderId, price } = await listToken(fixture, 103);
    const maxPayment = ethers.parseEther('2500');
    const swapInput = ethers.parseEther('2000');
    const fee = ethers.parseEther('200');
    const expectedRefund = ethers.parseEther('300');
    const deadline = BigInt(await time.latest()) + 600n;
    const path = [await usdt.getAddress(), await uki.getAddress()];

    await usdt.mint(buyer.address, maxPayment);
    await usdt.connect(buyer).approve(await marketplace.getAddress(), maxPayment);

    await expect(
      marketplace.connect(buyer).buyWithToken(
        orderId,
        await usdt.getAddress(),
        maxPayment,
        path,
        deadline,
      ),
    )
      .to.emit(marketplace, 'OrderFilled')
      .withArgs(
        orderId,
        buyer.address,
        await usdt.getAddress(),
        swapInput + fee,
        fee,
        price,
      );

    expect(await uki.balanceOf(seller.address)).to.equal(price);
    expect(await usdt.balanceOf(await router.getAddress())).to.equal(swapInput);
    expect(await usdt.balanceOf(feeRecipient.address)).to.equal(fee);
    expect(await usdt.balanceOf(buyer.address)).to.equal(expectedRefund);
    expect(await usdt.balanceOf(await marketplace.getAddress())).to.equal(0);
    expect(await nft.ownerOf(103)).to.equal(buyer.address);
  });

  it('buys with BNB through an exact-output swap, refunds surplus and accrues the BNB fee', async function () {
    const fixture = await loadFixture(deployFixture);
    const {
      seller,
      buyer,
      feeRecipient,
      outsider,
      uki,
      wrappedNative,
      router,
      marketplace,
      nft,
    } = fixture;
    const price = ethers.parseEther('1');
    const { orderId } = await listToken(fixture, 104, price);
    const payment = ethers.parseEther('2');
    const fee = ethers.parseEther('0.2');
    const value = ethers.parseEther('2.5');
    const deadline = BigInt(await time.latest()) + 600n;
    const path = [await wrappedNative.getAddress(), await uki.getAddress()];

    await expect(
      marketplace.connect(buyer).buyWithNative(orderId, path, deadline, { value }),
    )
      .to.emit(marketplace, 'OrderFilled')
      .withArgs(orderId, buyer.address, ethers.ZeroAddress, payment + fee, fee, price);

    expect(await uki.balanceOf(seller.address)).to.equal(price);
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(payment);
    expect(await ethers.provider.getBalance(await marketplace.getAddress())).to.equal(fee);
    expect(await marketplace.claimableNativeFees(feeRecipient.address)).to.equal(fee);
    expect(await nft.ownerOf(104)).to.equal(buyer.address);

    const recipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);
    await expect(marketplace.connect(outsider).claimNativeFees(feeRecipient.address))
      .to.emit(marketplace, 'NativeFeesClaimed')
      .withArgs(feeRecipient.address, fee);
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(
      recipientBalanceBefore + fee,
    );
    expect(await marketplace.claimableNativeFees(feeRecipient.address)).to.equal(0);
  });

  it('invalidates stale orders after approval revocation or ownership transfer', async function () {
    const fixture = await loadFixture(deployFixture);
    const { seller, buyer, outsider, uki, marketplace, nft } = fixture;
    const first = await listToken(fixture, 105);

    await nft.connect(seller).approve(ethers.ZeroAddress, 105);
    expect(await marketplace.orderState(first.orderId)).to.equal(INVALID);
    await expect(marketplace.connect(buyer).buyWithUki(first.orderId))
      .to.be.revertedWithCustomError(marketplace, 'OrderNotPurchasable')
      .withArgs(INVALID);
    await expect(marketplace.connect(outsider).refreshOrder(first.orderId))
      .to.emit(marketplace, 'OrderInvalidated');
    expect((await marketplace.orders(first.orderId)).state).to.equal(INVALID);

    const second = await listToken(fixture, 106);
    await nft.connect(seller).transferFrom(seller.address, outsider.address, 106);
    expect(await marketplace.orderState(second.orderId)).to.equal(INVALID);
    await uki.mint(buyer.address, ethers.parseEther('1100'));
    await uki.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await expect(marketplace.connect(buyer).buyWithUki(second.orderId))
      .to.be.revertedWithCustomError(marketplace, 'OrderNotPurchasable')
      .withArgs(INVALID);
  });

  it('expires, cancels and relists with monotonic nonces and distinct order IDs', async function () {
    const fixture = await loadFixture(deployFixture);
    const { seller, buyer, marketplace, nft } = fixture;
    const first = await listToken(fixture, 107, ethers.parseEther('1000'), 60);

    await expect(marketplace.connect(buyer).cancelOrder(first.orderId))
      .to.be.revertedWithCustomError(marketplace, 'NotOrderSeller')
      .withArgs(buyer.address, seller.address);
    await expect(marketplace.connect(seller).cancelOrder(first.orderId))
      .to.emit(marketplace, 'OrderCancelled')
      .withArgs(first.orderId, seller.address);
    expect(await marketplace.orderState(first.orderId)).to.equal(CANCELLED);

    await nft.connect(seller).approve(await marketplace.getAddress(), 107);
    const secondExpiry = BigInt(await time.latest()) + 60n;
    await marketplace.connect(seller).createOrder(
      await nft.getAddress(),
      107,
      ethers.parseEther('1200'),
      secondExpiry,
    );
    const secondOrderId = await marketplace.activeOrderIds(await nft.getAddress(), 107);
    expect(secondOrderId).not.to.equal(first.orderId);
    expect((await marketplace.orders(secondOrderId)).nonce).to.equal(2);

    await time.increaseTo(secondExpiry);
    expect(await marketplace.orderState(secondOrderId)).to.equal(EXPIRED);
    await expect(marketplace.refreshOrder(secondOrderId))
      .to.emit(marketplace, 'OrderExpired')
      .withArgs(secondOrderId);
    expect((await marketplace.orders(secondOrderId)).state).to.equal(EXPIRED);
  });

  it('lets the current owner invalidate all older token order generations', async function () {
    const fixture = await loadFixture(deployFixture);
    const { seller, buyer, marketplace, nft } = fixture;
    const { orderId, collection } = await listToken(fixture, 108);

    await expect(marketplace.connect(buyer).invalidateTokenOrders(collection, 108))
      .to.be.revertedWithCustomError(marketplace, 'NotTokenOwner')
      .withArgs(buyer.address, seller.address);
    await expect(marketplace.connect(seller).invalidateTokenOrders(collection, 108))
      .to.emit(marketplace, 'TokenNonceInvalidated')
      .withArgs(collection, 108, 2, seller.address);

    expect(await marketplace.orderState(orderId)).to.equal(INVALID);
    expect(await marketplace.tokenNonces(collection, 108)).to.equal(2);
    expect(await marketplace.activeOrderIds(collection, 108)).to.equal(ethers.ZeroHash);
  });

  it('keeps the listed fee snapshot and blocks buys/listings while paused without blocking cancellation', async function () {
    const fixture = await loadFixture(deployFixture);
    const { owner, seller, buyer, feeRecipient, uki, marketplace, nft } = fixture;
    const { orderId, price } = await listToken(fixture, 109);
    await marketplace.connect(owner).setFeeConfig(feeRecipient.address, 500);
    await marketplace.connect(owner).pause();

    await uki.mint(buyer.address, ethers.parseEther('1100'));
    await uki.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await expect(marketplace.connect(buyer).buyWithUki(orderId))
      .to.be.revertedWithCustomError(marketplace, 'EnforcedPause');

    await nft.mint(seller.address, 110);
    await nft.connect(seller).approve(await marketplace.getAddress(), 110);
    await expect(
      marketplace.connect(seller).createOrder(
        await nft.getAddress(),
        110,
        price,
        BigInt(await time.latest()) + 3600n,
      ),
    ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');

    await expect(marketplace.connect(seller).cancelOrder(orderId))
      .to.emit(marketplace, 'OrderCancelled');
    await marketplace.connect(owner).unpause();
    expect((await marketplace.orders(orderId)).feeBps).to.equal(FEE_BPS);
  });

  it('rejects invalid routes, unsupported payment tokens and insufficient total budgets atomically', async function () {
    const fixture = await loadFixture(deployFixture);
    const { buyer, uki, usdt, wrappedNative, marketplace, nft } = fixture;
    const first = await listToken(fixture, 111, ethers.parseEther('1000'));
    const deadline = BigInt(await time.latest()) + 600n;
    const maxPayment = ethers.parseEther('2100');

    await usdt.mint(buyer.address, maxPayment);
    await usdt.connect(buyer).approve(await marketplace.getAddress(), maxPayment);
    await expect(
      marketplace.connect(buyer).buyWithToken(
        first.orderId,
        await usdt.getAddress(),
        maxPayment,
        [await usdt.getAddress(), await wrappedNative.getAddress()],
        deadline,
      ),
    ).to.be.revertedWithCustomError(marketplace, 'InvalidPath');
    expect(await nft.ownerOf(111)).to.equal(fixture.seller.address);
    expect(await marketplace.orderState(first.orderId)).to.equal(ACTIVE);

    await expect(
      marketplace.connect(buyer).buyWithToken(
        first.orderId,
        await wrappedNative.getAddress(),
        maxPayment,
        [await wrappedNative.getAddress(), await uki.getAddress()],
        deadline,
      ),
    ).to.be.revertedWithCustomError(marketplace, 'PaymentTokenNotAllowed');

    await expect(
      marketplace.connect(buyer).buyWithToken(
        first.orderId,
        await usdt.getAddress(),
        maxPayment,
        [await usdt.getAddress(), await uki.getAddress()],
        deadline,
      ),
    ).to.be.revertedWithCustomError(fixture.router, 'ExcessiveInput');
    expect(await nft.ownerOf(111)).to.equal(fixture.seller.address);
    expect(await usdt.balanceOf(buyer.address)).to.equal(maxPayment);
    expect(await marketplace.orderState(first.orderId)).to.equal(ACTIVE);
  });

  it('enforces bounded configuration and two-step ownership with renounce disabled', async function () {
    const fixture = await loadFixture(deployFixture);
    const { owner, seller, nextOwner, marketplace, nft, usdt } = fixture;
    const collection = await nft.getAddress();

    await expect(marketplace.connect(seller).setCollectionAllowed(collection, false))
      .to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount')
      .withArgs(seller.address);
    await expect(marketplace.connect(owner).setFeeConfig(seller.address, 1001))
      .to.be.revertedWithCustomError(marketplace, 'InvalidFee');
    await expect(marketplace.connect(owner).setPaymentTokenAllowed(await usdt.getAddress(), true))
      .to.emit(marketplace, 'PaymentTokenAllowedUpdated');
    await expect(marketplace.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(marketplace, 'OwnershipRenounceDisabled');

    await marketplace.connect(owner).transferOwnership(nextOwner.address);
    await expect(marketplace.connect(nextOwner).pause())
      .to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
    await marketplace.connect(nextOwner).acceptOwnership();
    await marketplace.connect(nextOwner).pause();
    expect(await marketplace.paused()).to.equal(true);
  });
});
