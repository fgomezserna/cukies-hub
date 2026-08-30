import { parseAbiItem, type AbiEvent } from 'viem';

import type { EventName } from '../types.js';

export const eventSignatures: Record<EventName, string> = {
  Transfer:
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  CukieMetadataConfigured:
    'event CukieMetadataConfigured(uint256 indexed tokenId, uint8 rarity, uint8 generation)',
  Mint: 'event Mint(address indexed user, uint256 points)',
  Burn: 'event Burn(address indexed user, uint256 points)',
  Stake: 'event Stake(address indexed user, uint256 tokenId, uint256 date)',
  Unstake:
    'event Unstake(address indexed user, uint256 tokenId, uint256 date, uint256 points)',
  BreedStart:
    'event BreedStart(address indexed user, uint256 indexed parent1, uint256 indexed parent2, uint256 date)',
  BreedFinish:
    'event BreedFinish(address indexed user, uint256 indexed parent1, uint256 indexed parent2, uint256 result, uint256 date)',
  TokenOnSale:
    'event TokenOnSale(uint256 tokenId, address owner, uint256 price, uint256 fee, uint256 createdAt)',
  TokenBought:
    'event TokenBought(uint256 tokenId, address newOwner, uint256 boughtAt)',
  MarketTokenSaleCancelled:
    'event MarketTokenSaleCancelled(uint256 tokenId)',
  MarketTokenPriceChanged:
    'event MarketTokenPriceChanged(uint256 tokenId, uint256 newPrice, uint256 newFee)',
  UkiMarketplaceOrderCreated:
    'event OrderCreated(bytes32 indexed orderId, address indexed collection, uint256 indexed tokenId, address seller, uint256 ukiPrice, uint64 expiresAt, uint64 nonce, uint16 feeBps)',
  UkiMarketplaceOrderCancelled:
    'event OrderCancelled(bytes32 indexed orderId, address indexed seller)',
  UkiMarketplaceOrderExpired:
    'event OrderExpired(bytes32 indexed orderId)',
  UkiMarketplaceOrderInvalidated:
    'event OrderInvalidated(bytes32 indexed orderId, bytes32 indexed reason)',
  UkiMarketplaceTokenNonceInvalidated:
    'event TokenNonceInvalidated(address indexed collection, uint256 indexed tokenId, uint64 nonce, address indexed owner)',
  UkiMarketplaceOrderFilled:
    'event OrderFilled(bytes32 indexed orderId, address indexed buyer, address indexed paymentToken, uint256 paymentAmount, uint256 feeAmount, uint256 ukiPrice)',
  JumpInBridge:
    'event JumpInBridge(uint256 tokenId, address originOwner, address destOwner, uint8 network, uint256 createdAt)',
  JumpOutBridge:
    'event JumpOutBridge(uint256 tokenId, address destOwner, uint256 createdAt)',
  Purchased:
    'event Purchased(address indexed buyer, uint256 asmAmount, uint256 ukiAmount, uint256 totalBuyerAsm, uint256 totalBuyerUki)',
  Staked:
    'event Staked(address indexed account, uint256 amount, uint256 accountBalance, uint256 totalStaked)',
  Unstaked:
    'event Unstaked(address indexed account, uint256 amount, uint256 accountBalance, uint256 totalStaked)',
  VestingCreated:
    'event VestingCreated(address indexed beneficiary, bytes32 indexed scheduleId, uint256 amount, uint64 start, uint64 cliff, uint64 duration)',
  TokensReleased:
    'event TokensReleased(address indexed beneficiary, bytes32 indexed scheduleId, uint256 amount)',
  BatchPublished:
    'event BatchPublished(bytes32 indexed batchId, bytes32 indexed merkleRoot, bytes32 inputHash, bytes32 metadataHash, uint256 totalAllocated, uint64 startsAt, uint64 expiresAt)',
  RewardClaimed:
    'event RewardClaimed(bytes32 indexed batchId, address indexed account, uint256 amount)',
  BatchClosed:
    'event BatchClosed(bytes32 indexed batchId, uint256 unclaimedAmount)',
  CukieMasterCollectionAllowedUpdated:
    'event CollectionAllowedUpdated(address indexed collection, bool allowed)',
  CukieMasterDeposited:
    'event Deposited(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint256 depositEpoch, uint256 depositedAt)',
  CukieMasterWithdrawn:
    'event Withdrawn(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint256 depositEpoch, uint256 withdrawnAt)',
  CukieMasterUntrackedERC721Recovered:
    'event UntrackedERC721Recovered(address indexed collection, uint256 indexed tokenId, address indexed recipient, uint256 recoveredAt)',
  CukiePoolCollectionAllowedUpdated:
    'event CollectionAllowedUpdated(address indexed collection, bool allowed)',
  CukiePoolCalendarVersionScheduled:
    'event CalendarVersionScheduled(uint32 indexed version, uint64 effectiveAt, uint64 firstCutoffAt, uint64 firstPeriodId, uint32 periodAnchorSeconds)',
  CukiePoolDeposited:
    'event Deposited(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint64 depositEpoch, uint64 depositedAt, uint64 depositPeriodId, uint64 activationAt, uint64 activationPeriodId, uint32 calendarVersion)',
  CukiePoolExitRequested:
    'event ExitRequested(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint64 depositEpoch, uint64 requestedAt, uint64 exitPeriodId, uint64 withdrawableAt, uint32 calendarVersion)',
  CukiePoolWithdrawableAtAdvanced:
    'event WithdrawableAtAdvanced(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint64 depositEpoch, uint64 previousWithdrawableAt, uint64 newWithdrawableAt)',
  CukiePoolWithdrawn:
    'event Withdrawn(address indexed collection, uint256 indexed tokenId, address indexed beneficiary, uint64 depositEpoch, uint64 withdrawnAt)',
  CukiePoolUntrackedERC721Recovered:
    'event UntrackedERC721Recovered(address indexed collection, uint256 indexed tokenId, address indexed recipient, uint64 recoveredAt)',
};

export const bscEventAbis = Object.fromEntries(
  Object.entries(eventSignatures).map(([eventName, signature]) => [
    eventName,
    parseAbiItem(signature) as AbiEvent,
  ]),
) as Record<EventName, AbiEvent>;
