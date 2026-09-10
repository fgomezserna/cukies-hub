import { HttpStatus } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryModel: {
    findOne: jest.Mock;
    count: jest.Mock;
  };
  let itemModel: {
    findOne: jest.Mock;
  };
  let cukiService: {
    checkCukiOwner: jest.Mock;
  };

  const makeInventory = (overrides: Record<string, unknown> = {}) => ({
    slots: 1,
    content: [],
    save: jest.fn().mockImplementation(function save() {
      return Promise.resolve(this);
    }),
    ...overrides,
  });

  beforeEach(() => {
    cukiService = {
      checkCukiOwner: jest.fn().mockResolvedValue(true),
    };
    inventoryModel = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    };
    itemModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ItemID: 'Wood_Tier0' }),
      }),
    };

    service = new InventoryService(
      { get: jest.fn().mockReturnValue(cukiService) } as any,
      inventoryModel as any,
      itemModel as any
    );
    service.onModuleInit();
  });

  function mockInventory(inventory: any) {
    inventoryModel.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(inventory),
    });
  }

  it('stacks an item in an occupied slot when the item id matches', async () => {
    const inventory = makeInventory({
      content: [{ id: 'Wood_Tier0', slot: 0, amount: 1, durability: 0 }],
    });
    mockInventory(inventory);

    await expect(
      service.addItemsToInventory({
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: [{ id: 'Wood_Tier0', amount: 2, slot: 0 }],
      })
    ).resolves.toMatchObject({ totalCount: 1 });

    expect(inventory.content).toEqual([
      { id: 'Wood_Tier0', slot: 0, amount: 3, durability: 0 },
    ]);
    expect(inventory.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a new item when the target slot is occupied by another item', async () => {
    const inventory = makeInventory({
      content: [{ id: 'Branch_Tier0', slot: 0, amount: 1, durability: 0 }],
    });
    mockInventory(inventory);

    await expect(
      service.addItemsToInventory({
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: [{ id: 'Wood_Tier0', amount: 1, slot: 0 }],
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Inventory slot is occupied',
    });

    expect(inventory.save).not.toHaveBeenCalled();
  });

  it('rejects an item when the target slot is outside inventory capacity', async () => {
    const inventory = makeInventory();
    mockInventory(inventory);

    await expect(
      service.addItemToInventory({
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: { id: 'Wood_Tier0', amount: 1, slot: 1 },
      })
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Inventory slot is outside inventory capacity',
    });

    expect(inventory.save).not.toHaveBeenCalled();
  });

  it('rejects stale inventory writes as a concurrent island action conflict', async () => {
    const versionError = Object.assign(new Error('stale inventory'), {
      name: 'VersionError',
    });
    const inventory = makeInventory({
      content: [{ id: 'Wood_Tier0', slot: 0, amount: 1, durability: 0 }],
      save: jest.fn().mockRejectedValue(versionError),
    });
    mockInventory(inventory);

    await expect(
      service.removeItemsFromInventory({
        userId: 'user-a',
        cukiId: 'cuki-a',
        itemContentDto: [{ id: 'Wood_Tier0', amount: 1, slot: 0 }],
      })
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: 'Inventory changed concurrently, retry action',
    });

    expect(inventory.save).toHaveBeenCalledTimes(1);
  });
});
