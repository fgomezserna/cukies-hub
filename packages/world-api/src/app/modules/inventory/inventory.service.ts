import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  IGet,
  IInventoryItem,
  IResponseCRUD,
  Output,
  isResponse,
  isResponseCRUD,
} from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Inventory,
  InventoryDocument,
  Item,
  ItemDocument,
} from '@cukies/world-shared';
import { CukiService } from '../cuki/cuki.service';
import { ChangeEquipItemDto } from './dto/change-equipItem.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { EquipItemDto } from './dto/equipItem.dto';
import { ItemContentDto } from './dto/itemContent.dto';
import { SwapSlotsDto } from './dto/swapSlotsDto.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService implements OnModuleInit {
  private inventoryCRUD: CRUD | null = null;
  private cukiService: CukiService;
  private readonly armourEquipSlots = [
    'head',
    'body',
    'feet',
    'hands',
    'face',
    'back',
  ];
  private readonly toolEquipSlots = ['rightHand', 'leftHand'];

  constructor(
    private moduleRef: ModuleRef,
    @InjectModel(Inventory.name, 'gameDB')
    private inventoryModel: Model<InventoryDocument>,

    @InjectModel(Item.name, 'gameDB')
    private itemModel: Model<ItemDocument>
  ) {
    this.inventoryCRUD = new CRUD(this.inventoryModel);
  }

  onModuleInit() {
    this.cukiService = this.moduleRef.get(CukiService, { strict: false });
  }

  private toInteger(value: unknown, fieldName: string): number {
    const parsed =
      typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number(value);

    if (!Number.isInteger(parsed)) {
      throw new HttpException(`${fieldName} must be an integer`, HttpStatus.BAD_REQUEST);
    }

    return parsed;
  }

  private normalizeItemContent(
    itemContentDto: ItemContentDto,
    options: { allowZeroAmount?: boolean } = {}
  ): ItemContentDto {
    const rawItem = itemContentDto as any;
    const id = `${rawItem.id ?? rawItem.item ?? ''}`.trim();
    if (!id) {
      throw new HttpException('Item id is required', HttpStatus.BAD_REQUEST);
    }

    const amount = this.toInteger(rawItem.amount, 'amount');
    if (amount < 0 || (!options.allowZeroAmount && amount === 0)) {
      throw new HttpException('amount must be positive', HttpStatus.BAD_REQUEST);
    }

    const slot = this.toInteger(rawItem.slot ?? 0, 'slot');
    if (slot < 0) {
      throw new HttpException('slot must be zero or positive', HttpStatus.BAD_REQUEST);
    }

    const durability =
      rawItem.durability === undefined || rawItem.durability === null
        ? 0
        : this.toInteger(rawItem.durability, 'durability');

    return {
      ...itemContentDto,
      id,
      amount,
      slot,
      durability,
    };
  }

  private emptyInventoryItem(): IInventoryItem {
    return {
      id: '',
      slot: 0,
      amount: 0,
      durability: 0,
    };
  }

  private isEmptyInventoryItem(item: IInventoryItem | string | undefined): boolean {
    return !item || typeof item === 'string' || !item.id || item.amount <= 0;
  }

  private addContentItem(inventory: InventoryDocument, item: ItemContentDto): void {
    const existingItem = inventory.content.find(
      (contentItem) => contentItem.id === item.id && contentItem.slot === item.slot
    );

    if (existingItem) {
      existingItem.amount += item.amount;
      if (item.durability !== undefined) {
        existingItem.durability = item.durability;
      }
      return;
    }

    inventory.content.push({
      id: item.id,
      slot: item.slot,
      amount: item.amount,
      durability: item.durability ?? 0,
    });
  }

  private assertCanAddContentItems(
    inventory: InventoryDocument,
    items: ItemContentDto[]
  ): void {
    const slotLimit = Number.isInteger(inventory.slots) ? inventory.slots : 0;
    const occupiedSlots = new Map<number, string>();

    for (const contentItem of inventory.content ?? []) {
      if (!contentItem?.id || contentItem.amount <= 0) continue;
      occupiedSlots.set(contentItem.slot, contentItem.id);
    }

    for (const item of items) {
      if (item.slot >= slotLimit) {
        throw new HttpException(
          'Inventory slot is outside inventory capacity',
          HttpStatus.BAD_REQUEST
        );
      }

      const occupiedItemId = occupiedSlots.get(item.slot);
      if (occupiedItemId && occupiedItemId !== item.id) {
        throw new HttpException('Inventory slot is occupied', HttpStatus.CONFLICT);
      }

      occupiedSlots.set(item.slot, item.id);
    }
  }

  private removeContentItem(inventory: InventoryDocument, item: ItemContentDto): void {
    const existingItem = inventory.content.find(
      (contentItem) => contentItem.id === item.id && contentItem.slot === item.slot
    );

    if (!existingItem) {
      throw new HttpException('Item not found in inventory slot', HttpStatus.NOT_FOUND);
    }

    if (existingItem.amount < item.amount) {
      throw new HttpException('Not enough item amount in inventory slot', HttpStatus.BAD_REQUEST);
    }

    existingItem.amount -= item.amount;
    if (existingItem.amount === 0) {
      inventory.content = inventory.content.filter(
        (contentItem) =>
          !(contentItem.id === item.id && contentItem.slot === item.slot)
      );
    }
  }

  private async assertItemExists(itemId: string): Promise<void> {
    const itemFound = await this.itemModel.findOne({ ItemID: itemId }).exec();
    if (!itemFound) {
      throw new HttpException('Item not found in DB', HttpStatus.NOT_FOUND);
    }
  }

  private isVersionConflict(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      (error as { name?: string }).name === 'VersionError'
    );
  }

  private async saveInventory(
    inventory: InventoryDocument
  ): Promise<InventoryDocument> {
    try {
      return await inventory.save();
    } catch (error) {
      if (this.isVersionConflict(error)) {
        throw new HttpException(
          'Inventory changed concurrently, retry action',
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  private getEquipContainer(inventory: InventoryDocument, equipSlot: string): any {
    if (this.armourEquipSlots.includes(equipSlot)) {
      return inventory.equipment.armour;
    }

    if (this.toolEquipSlots.includes(equipSlot)) {
      return inventory.equipment.tool;
    }

    throw new HttpException('Equip Slot not found', HttpStatus.BAD_REQUEST);
  }

  /**
   * Method to find all Inventories
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.inventoryCRUD.getAll(findParams);
  }

  /**
   * Method to find specific Inventory by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.inventoryCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew Inventory
   * @param createInventoryDto : New object
   * @returns
   */
  async create(params: {
    createInventoryDto: CreateInventoryDto;
  }): Promise<Output> {
    const { createInventoryDto } = params;
    return await this.inventoryCRUD.create(createInventoryDto);
  }

  /**
   * Method to update some Inventory data.
   * @param id : Inventory id that we want to change.
   * @param updateInventoryDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateInventoryDto: UpdateInventoryDto;
  }): Promise<Output> {
    const { id, updateInventoryDto } = params;
    return await this.inventoryCRUD.update(id, updateInventoryDto);
  }

  /**
   * Method to remove some Inventory object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.inventoryCRUD.remove(id);
  }

  /**
   * Method to find specific Inventory by User Id
   * @param userId
   * @returns
   */
  async findOneFromToken(params: {
    userId: string;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    return await this.getInventory({ userId, cukiId });
  }

  /**
   * Método para intercambiar los slots de dos elementos en el inventario.
   * @param slot1: Slot del primer elemento.
   * @param slot2: Slot del segundo elemento.
   * @returns : nuevo objeto
   */
  async swapSlots(params: {
    userId: string;
    swapSlotsDto: SwapSlotsDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, swapSlotsDto, cukiId } = params;
    const { slot1, slot2 } = swapSlotsDto;
    const inventoryResults: Output = await this.getInventory({
      userId,
      cukiId,
    });
    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }
    if (!inventoryResults?.results[0])
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);

    const inventory: InventoryDocument = inventoryResults.results[0];
    const item1 = inventory.content.find((item) => item.slot === slot1);
    const item2 = inventory.content.find((item) => item.slot === slot2);

    if (item1) {
      item1.slot = slot2;
      await this.saveInventory(inventory);
    }
    if (item2) {
      item2.slot = slot1;
      await this.saveInventory(inventory);
    }

    const output: IResponseCRUD = {
      totalCount: 1,
      results: [inventory],
    };
    return output;
  }

  /**
   * Método para intercambiar los slots de dos elementos en el inventario.
   * @param slot1: Slot del primer elemento.
   * @param slot2: Slot del segundo elemento.
   * @returns : nuevo objeto
   */
  async swapUserSlots(params: {
    userId: string;
    swapSlotsDto: SwapSlotsDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, swapSlotsDto, cukiId } = params;
    const { slot1, slot2 } = swapSlotsDto;
    const inventoryCukiResults: Output = await this.getInventory({
      userId,
      cukiId,
    });
    if (isResponse(inventoryCukiResults)) {
      return inventoryCukiResults;
    }
    if (!inventoryCukiResults?.results[0])
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);

    const inventoryUserResults: Output = await this.getInventory({
      userId,
      cukiId: null,
    });
    if (isResponse(inventoryUserResults)) {
      return inventoryUserResults;
    }
    if (!inventoryUserResults?.results[0])
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
    const inventoryUser: InventoryDocument = inventoryUserResults.results[0];
    const item1 = inventoryUser.content.find((item) => item.slot === slot1);
    const inventoryCuki: InventoryDocument = inventoryCukiResults.results[0];
    const item2 = inventoryCuki.content.find((item) => item.slot === slot2);

    const item1Back = item1 ? JSON.parse(JSON.stringify(item1)) : null;
    const item2Back = item2 ? JSON.parse(JSON.stringify(item2)) : null;
    if (item1 && item2) {
      item1.amount = item2Back.amount;
      item1.durability = item2Back.durability;
      item1.id = item2Back.id;
      item2.amount = item1Back.amount;
      item2.durability = item1Back.durability;
      item2.id = item1Back.id;
    } else if (item1 && item2 === undefined) {
      item1.slot = slot2;
      const item1Copy = JSON.parse(JSON.stringify(item1));
      item1Copy.id = item1.id;
      inventoryCuki.content.push(item1Copy);
      inventoryCuki.content[inventoryCuki.content.length - 1].id = item1.id;

      const index = inventoryUser.content.indexOf(item1);
      if (index > -1) {
        inventoryUser.content.splice(index, 1);
      }
    } else if (item1 === undefined && item2) {
      item2.slot = slot1;
      const item2Copy = JSON.parse(JSON.stringify(item2));
      item2Copy.id = item2.id;
      inventoryUser.content.push(item2Copy);
      inventoryUser.content[inventoryUser.content.length - 1].id = item2.id;

      const index = inventoryCuki.content.indexOf(item2);
      if (index > -1) {
        inventoryCuki.content.splice(index, 1);
      }
    }

    await this.saveInventory(inventoryCuki);
    await this.saveInventory(inventoryUser);

    const output: IResponseCRUD = {
      totalCount: 1,
      results: [inventoryUser],
    };
    return output;
  }

  /**
   * Method to add a new item to the inventory.
   * @param userId: Id of the user that we want to add the item.
   * @param itemContentDto: Data of the item to add.
   * @returns : new Object
   */
  async addItemToInventory(params: {
    userId: string;
    itemContentDto: ItemContentDto;
    cukiId: string | undefined;
    type?: string | undefined;
    error?: boolean;
  }) {
    const { userId, cukiId } = params;
    const itemContentDto = this.normalizeItemContent(params.itemContentDto, {
      allowZeroAmount: true,
    });
    if (itemContentDto.amount === 0) {
      return {
        totalCount: 0,
        results: [],
      };
    }

    await this.assertItemExists(itemContentDto.id);

    const inventoryResults: Output = await this.getInventory({
      userId,
      cukiId,
    });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }
    if (!inventoryResults?.results[0])
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);

    const inventory: InventoryDocument = inventoryResults.results[0];
    this.assertCanAddContentItems(inventory, [itemContentDto]);
    this.addContentItem(inventory, itemContentDto);
    const result = await this.saveInventory(inventory);

    const output: IResponseCRUD = {
      totalCount: 1,
      results: [result],
    };

    return output;
  }

  /**
   * Method to remove an item from the inventory.
   * @param userId: Id of the user that we want to remove the item.
   * @param itemContentDto: Data of the item to remove.
   * @returns : new Object
   */
  async removeItemFromInventory(params: {
    userId: string;
    itemContentDto: ItemContentDto;
    cukiId: string | undefined;
    type?: string | undefined;
    error?: boolean;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    const itemContentDto = this.normalizeItemContent(params.itemContentDto);
    await this.assertItemExists(itemContentDto.id);

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    if (inventory) {
      this.removeContentItem(inventory, itemContentDto);
      const result = await this.saveInventory(inventory);
      const output: IResponseCRUD = {
        totalCount: 1,
        results: [result],
      };

      return output;
    }

    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  /**
   * Method to add a new items to the inventory.
   * @param userId: Id of the user that we want to add the item.
   * @param itemContentDto[]: Array with data of the item to add.
   * @returns : new Object
   */
  async addItemsToInventory(params: {
    userId: string;
    itemContentDto: ItemContentDto[];
    cukiId: string | undefined;
    type?: string | undefined;
    error?: boolean;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    const itemContentDto = params.itemContentDto.map((item) =>
      this.normalizeItemContent(item)
    );

    for (const item of itemContentDto) {
      await this.assertItemExists(item.id);
    }

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];
    this.assertCanAddContentItems(inventory, itemContentDto);
    for (const item of itemContentDto) {
      this.addContentItem(inventory, item);
    }

    const result = await this.saveInventory(inventory);
    const output: IResponseCRUD = {
      totalCount: 1,
      results: [result],
    };

    return output;
  }

  /**
   * Method to remove an item from the inventory.
   * @param userId: Id of the user that we want to remove the item.
   * @param itemContentDto: Data of the item to remove.
   * @returns : new Object
   */
  async removeItemsFromInventory(params: {
    userId: string;
    itemContentDto: ItemContentDto[];
    cukiId: string | undefined;
    type?: string | undefined;
    error?: boolean;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    const itemContentDto = params.itemContentDto.map((item) =>
      this.normalizeItemContent(item)
    );

    for (const item of itemContentDto) {
      await this.assertItemExists(item.id);
    }

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    if (inventoryResults) {
      for (const itemRemove of itemContentDto) {
        const existingItem = inventory.content.find(
          (item) => item.slot === itemRemove.slot && item.id === itemRemove.id
        );
        if (!existingItem || existingItem.amount < itemRemove.amount) {
          throw new HttpException(
            'Not enough item amount in inventory slot',
            HttpStatus.BAD_REQUEST
          );
        }
      }

      for (const itemRemove of itemContentDto) {
        this.removeContentItem(inventory, itemRemove);
      }

      const result = await this.saveInventory(inventory);

      const output: IResponseCRUD = {
        totalCount: 1,
        results: [result],
      };

      return output;
    }

    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  /**
   * Method to check if the user has the item.
   * @param userId: Id of the user that we want to check the item.
   * @param itemContentDto: Data of the item to check.
   * @returns : new Object
   */
  async checkItemFromInventory(params: {
    userId: string;
    itemContentDto: ItemContentDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    const itemContentDto = this.normalizeItemContent(params.itemContentDto);

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    if (inventory) {
      // Check if the item already exists
      const itemAmount = inventory.content
        .filter((item) => item.id === itemContentDto.id)
        .reduce((amount, item) => amount + item.amount, 0);

      if (itemAmount >= itemContentDto.amount) {
        return {
          code: 200,
          message: 'Item found',
        };
      }

      const slotItem = inventory.content.find(
        (item) =>
          item.id === itemContentDto.id &&
          item.slot === itemContentDto.slot &&
          item.amount >= itemContentDto.amount
      );

      if (slotItem) {
        return {
          code: 200,
          message: 'Item found',
        };
      }
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }

    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  async getEquippedItems(params: {
    userId: string;
    cukiId: string;
  }): Promise<Output> {
    const { userId, cukiId } = params;

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    if (inventory) {
      // return inventory.equipment;
      const output: IResponseCRUD = {
        totalCount: 1,
        results: [inventory.equipment],
      };

      return output;
    }

    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  async equipItem(params: {
    userId: string;
    equipItemDto: EquipItemDto;
    cukiId: string;
  }): Promise<Output> {
    const { userId, equipItemDto, cukiId } = params;
    const id = `${equipItemDto.id ?? ''}`.trim();
    const inventorySlot = this.toInteger(equipItemDto.inventorySlot, 'inventorySlot');
    const equipSlot = `${equipItemDto.equipSlot ?? ''}`.trim();
    if (!id) throw new HttpException('Item id is required', HttpStatus.BAD_REQUEST);
    if (inventorySlot < 0)
      throw new HttpException('inventorySlot must be zero or positive', HttpStatus.BAD_REQUEST);

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    if (inventory) {
      const equipContainer = this.getEquipContainer(inventory, equipSlot);
      if (!this.isEmptyInventoryItem(equipContainer[equipSlot])) {
        throw new HttpException('Equip slot is occupied', HttpStatus.CONFLICT);
      }

      const item = inventory.content.find(
        (item) => item.id === id && item.slot === inventorySlot
      );
      if (!item)
        throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
      if (item.amount < 1)
        throw new HttpException('Item amount is empty', HttpStatus.BAD_REQUEST);

      const itemTool = JSON.parse(JSON.stringify(item));
      itemTool.amount = 1;
      equipContainer[equipSlot] = itemTool;

      const newContent = inventory.content.filter((item) => {
        if (item.slot === inventorySlot && item.id === id) {
          item.amount = item.amount - 1;
          if (item.amount === 0) {
            return false;
          }
        }
        return true;
      });
      inventory.content = newContent;

      const data = await this.saveInventory(inventory);
      //const data = this.inventoryCRUD.update(inventory._id, inventory);
      const output: IResponseCRUD = {
        totalCount: 1,
        results: [data],
        //results: [inventory],
      };

      return output;
    }

    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  async unequipItem(params: {
    userId: string;
    equipItemDto: EquipItemDto;
    cukiId: string;
  }): Promise<Output> {
    const { userId, equipItemDto, cukiId } = params;
    const id = `${equipItemDto.id ?? ''}`.trim();
    const inventorySlot = this.toInteger(equipItemDto.inventorySlot, 'inventorySlot');
    const equipSlot = `${equipItemDto.equipSlot ?? ''}`.trim();
    if (!id) throw new HttpException('Item id is required', HttpStatus.BAD_REQUEST);
    if (inventorySlot < 0)
      throw new HttpException('inventorySlot must be zero or positive', HttpStatus.BAD_REQUEST);

    let equipedItem = null;
    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];

    const equipContainer = this.getEquipContainer(inventory, equipSlot);
    if (equipContainer[equipSlot]?.id === id) {
      equipedItem = JSON.parse(JSON.stringify(equipContainer[equipSlot]));
      equipContainer[equipSlot] = this.emptyInventoryItem();
    }

    if (!equipedItem)
      throw new HttpException('Equiped item not found', HttpStatus.NOT_FOUND);

    const itemInInventory = inventory.content.find(
      (item) => item.slot === inventorySlot && item.amount > 0
    );
    if (itemInInventory && itemInInventory.id === id) {
      itemInInventory.amount += 1;
    } else if (itemInInventory && itemInInventory.id !== id) {
      throw new HttpException('Inventory slot is occupied', HttpStatus.CONFLICT);
    } else {
      const item = {
        slot: inventorySlot,
        amount: 1,
        durability: equipedItem.durability,
        id: id,
      };

      inventory.content.push(item);
    }

    const result = await this.saveInventory(inventory);
    //this.inventoryCRUD.update(inventory._id, inventory);
    const response: Output = {
      totalCount: 1,
      results: [result],
    };

    return response;
  }

  // funcion que permita cambiar la durabilidad de una tool
  // hay que hacer la funcion con la misma estructura que las demas... comentarios, etc
  /**
   * @param equipItemDto
   * @returns
   * @memberof InventoryService
   * @description
   * @param {EquipItemDto} equipItemDto
   */
  async changeDurability(params: {
    userId: string;
    changeEquipItemDto: ChangeEquipItemDto;
    cukiId: string;
  }): Promise<Output> {
    const { userId, changeEquipItemDto, cukiId } = params;

    const durability = this.toInteger(changeEquipItemDto.durability, 'durability');
    const equipSlot = `${changeEquipItemDto.equipSlot ?? ''}`.trim();
    if (durability < 0)
      throw new HttpException('durability must be zero or positive', HttpStatus.BAD_REQUEST);

    const inventoryResults = await this.getInventory({ userId, cukiId });

    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }

    const inventory: InventoryDocument = inventoryResults.results[0];
    if (inventory) {
      const equipContainer = this.getEquipContainer(inventory, equipSlot);
      const item = equipContainer[equipSlot];
      if (this.isEmptyInventoryItem(item)) {
        throw new HttpException('Equipped item not found', HttpStatus.NOT_FOUND);
      }

      const itemTool = JSON.parse(JSON.stringify(item));
      itemTool.durability = durability;
      equipContainer[equipSlot] = itemTool;

      const data = await this.saveInventory(inventory);
      //const data = this.inventoryCRUD.update(inventory._id, inventory);
      const output: IResponseCRUD = {
        totalCount: 1,
        results: [data],
        //results: [inventory],
      };

      return output;
    }
    throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
  }

  /**
   * Get inventory of user or cuki. If doesn't exist, create a new one.
   * @param userId
   * @param cukiId
   */
  async getInventory(params: {
    userId: string;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;

    if (cukiId) await this.cukiService.checkCukiOwner({ userId, cukiId });

    const inventory = await this.inventoryCRUD.getOne({
      filterQuery: cukiId ? { cuki: cukiId } : { user: userId },
    });

    if ((isResponseCRUD(inventory) && (inventory.totalCount ?? 0) > 0) || isResponse(inventory)) return inventory;

    return this.createInventory({ userId, cukiId });
  }

  /**
   * Create a new inventory
   * @param userId
   * @param cukiId
   */
  async createInventory(params: {
    userId: string;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;

    // Create a new inventory
    if (cukiId) {
      return await this.inventoryCRUD.create({
        cuki: cukiId,
        slots: 10,
        content: [],
        equipment: {
          armour: {
            head: this.emptyInventoryItem(),
            body: this.emptyInventoryItem(),
            feet: this.emptyInventoryItem(),
            hands: this.emptyInventoryItem(),
            face: this.emptyInventoryItem(),
            back: this.emptyInventoryItem(),
          },
          tool: {
            rightHand: this.emptyInventoryItem(),
            leftHand: this.emptyInventoryItem(),
          },
        },
      });
    }

    const data = (await this.inventoryCRUD.create({
      user: userId,
      slots: 10,
      content: [],
    })) as Output;

    return data;
  }
  async swapItemswithChest(params: {
    userId: string;
    itemContent: (ItemContentDto | undefined)[];
    cukiId: string;
  }) {
    const { userId, itemContent, cukiId } = params;
    const [chestItem, cukiItem] = itemContent;
    if (!chestItem && !cukiItem) {
      throw new HttpException('Need one item at least', HttpStatus.BAD_REQUEST);
    }
    try {
      if (!chestItem && cukiItem) {
        await this.addItemToInventory({
          userId,
          itemContentDto: cukiItem,
          cukiId: undefined,
        });
        await this.removeItemFromInventory({
          userId,
          itemContentDto: cukiItem,
          cukiId,
        });
      } else if (chestItem && !cukiItem) {
        await this.addItemToInventory({
          userId,
          itemContentDto: chestItem,
          cukiId,
        });
        await this.removeItemFromInventory({
          userId,
          itemContentDto: chestItem,
          cukiId: undefined,
        });
      } else if (chestItem && cukiItem) {
        await this.removeItemFromInventory({
          userId,
          itemContentDto: chestItem,
          cukiId: undefined,
        });
        await this.removeItemFromInventory({
          userId,
          itemContentDto: cukiItem,
          cukiId,
        });
        await this.addItemToInventory({
          userId,
          itemContentDto: cukiItem,
          cukiId: undefined,
        });
        await this.addItemToInventory({
          userId,
          itemContentDto: chestItem,
          cukiId,
        });
      }
    } catch (error) {
      console.log('Error swapping items: ', error);
      throw new HttpException(
        'Error swapping items',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    return {
      message: 'Items swapped',
      code: 200,
    };
  }
}
