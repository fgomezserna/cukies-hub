import { parseAbiItem, type AbiEvent } from 'viem';

import type { EventName } from '../types.js';

export const eventSignatures: Record<EventName, string> = {
  Transfer:
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  Approval:
    'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  ApprovalForAll:
    'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
  MinterAdded: 'event MinterAdded(address indexed account)',
  MinterRemoved: 'event MinterRemoved(address indexed account)',
  OwnershipRenounced: 'event OwnershipRenounced(address indexed previousOwner)',
  OwnershipTransferred:
    'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  OwnershipTransferStarted:
    'event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)',
  Paused: 'event Paused(address account)',
  Unpaused: 'event Unpaused(address account)',
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
  MintReferral:
    'event MintReferral(address indexed user, address indexed sponsor, uint256 num, uint256 value, uint256 comission, uint8 indexed level)',
  BridgeRequested:
    'event BridgeRequested(bytes32 indexed transferId, uint256 indexed tokenId, address indexed sourceOwner, bytes20 destinationOwner, uint8 sourceNetwork, uint8 destinationNetwork, uint256 nonce, uint256 feePaid, bytes32 metadataHash, uint256 createdAt)',
  BridgeCompleted:
    'event BridgeCompleted(bytes32 indexed transferId, uint256 indexed tokenId, address indexed destinationOwner, uint8 sourceNetwork, uint8 destinationNetwork, bool minted, bytes32 metadataHash, uint256 createdAt)',
  RelayerUpdated: 'event RelayerUpdated(address indexed relayer, bool allowed)',
  BridgePriceUpdated: 'event BridgePriceUpdated(uint256 previousPrice, uint256 newPrice)',
  FeeRecipientUpdated:
    'event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient)',
  UntrackedERC721Recovered:
    'event UntrackedERC721Recovered(address indexed collectionAddress, uint256 indexed tokenId, address indexed recipient)',
  CollectionAllowedUpdated:
    'event CollectionAllowedUpdated(address indexed collection, bool allowed)',
  PaymentTokenAllowedUpdated:
    'event PaymentTokenAllowedUpdated(address indexed paymentToken, bool allowed)',
  NativePaymentAllowedUpdated: 'event NativePaymentAllowedUpdated(bool allowed)',
  FeeConfigUpdated: 'event FeeConfigUpdated(address indexed recipient, uint16 feeBps)',
  NativeFeesClaimed: 'event NativeFeesClaimed(address indexed recipient, uint256 amount)',
  MinPurchaseUpdated: 'event MinPurchaseUpdated(uint256 minAsmPerPurchase)',
  SaleEnabledUpdated: 'event SaleEnabledUpdated(bool enabled)',
  SaleWindowUpdated: 'event SaleWindowUpdated(uint64 saleStart, uint64 saleEnd)',
  TotalUkiForSaleUpdated: 'event TotalUkiForSaleUpdated(uint256 totalUkiForSale)',
  TreasuryUpdated:
    'event TreasuryUpdated(address indexed previousTreasury, address indexed nextTreasury)',
  UkiPerAsmUpdated: 'event UkiPerAsmUpdated(uint256 previousUkiPerAsm, uint256 nextUkiPerAsm)',
  PresaleVestingConfigFrozen: 'event PresaleVestingConfigFrozen(uint64 start, uint64 duration)',
  PresaleVestingConfigUpdated: 'event PresaleVestingConfigUpdated(uint64 start, uint64 duration)',
  RoleAdminChanged:
    'event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)',
  RoleGranted:
    'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  RoleRevoked:
    'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  UnallocatedWithdrawn: 'event UnallocatedWithdrawn(address indexed to, uint256 amount)',
  ExcessRecovered: 'event ExcessRecovered(address indexed to, uint256 amount)',
  UkiTokenApproval: 'event Approval(address indexed owner, address indexed spender, uint256 value)',
  UkiTokenOwnershipTransferred:
    'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  UkiTokenPaused: 'event Paused(address account)',
  UkiTokenTransfer: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  UkiTokenUnpaused: 'event Unpaused(address account)',
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

// TRONGrid returns ABI events separately from viem and legacy bridge versions
// do not share the BSC JumpOutBridge payload. Keep the shape that affects
// decoding explicit instead of inferring it from the event name.
export const tronEventSignatures: Partial<Record<EventName, string>> = {
  JumpOutBridge: 'event JumpOutBridge(uint256 tokenId, uint256 createdAt)',
};
