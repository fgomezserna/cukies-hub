import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  IGet,
  Output,
  isResponse,
} from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Item,
  ItemDocument,
  Movement,
  MovementDocument,
  User,
  UserDocument,
} from '@cukies/world-shared';
import { ItemContentDto } from '../inventory/dto/itemContent.dto';
import { InventoryService } from '../inventory/inventory.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
@Injectable()
export class ItemService {
  private itemCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Item.name, 'gameDB') private itemModel: Model<ItemDocument>,
    @InjectModel(User.name, 'cukiesDB') private userModel: Model<UserDocument>,
    @InjectModel(Movement.name, 'gameDB')
    private movementModel: Model<MovementDocument>,
    private inventoryService: InventoryService
  ) {
    this.itemCRUD = new CRUD(this.itemModel);
  }

  private toHttpStatus(
    code: unknown,
    fallback: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR
  ): HttpStatus {
    const parsed = Number(code);
    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
      return parsed as HttpStatus;
    }

    return fallback;
  }

  private throwMarketError(message: string, status: HttpStatus): never {
    throw new HttpException({ message, code: status }, status);
  }

  private throwMarketException(
    error: unknown,
    fallbackMessage: string,
    fallbackStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR
  ): never {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const status = this.toHttpStatus(error.getStatus(), fallbackStatus);
      if (typeof response === 'string') {
        this.throwMarketError(response, status);
      }

      const responseBody = response as { message?: unknown; code?: unknown };
      const responseMessage = Array.isArray(responseBody?.message)
        ? responseBody.message.join(', ')
        : responseBody?.message;
      this.throwMarketError(
        typeof responseMessage === 'string' && responseMessage.length > 0
          ? responseMessage
          : fallbackMessage,
        this.toHttpStatus(responseBody?.code, status)
      );
    }

    this.throwMarketError(
      error instanceof Error && error.message ? error.message : fallbackMessage,
      fallbackStatus
    );
  }

  private assertMarketOutputSucceeded(response: Output): void {
    if (!isResponse(response)) {
      return;
    }

    this.throwMarketError(
      response.message,
      this.toHttpStatus(response.code, HttpStatus.BAD_REQUEST)
    );
  }

  private toInteger(value: unknown, fieldName: string): number {
    const parsed =
      typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number(value);

    if (!Number.isInteger(parsed)) {
      throw new Error(`${fieldName} must be an integer`);
    }

    return parsed;
  }

  private toPositiveInteger(value: unknown, fieldName: string): number {
    const parsed = this.toInteger(value, fieldName);
    if (parsed <= 0) {
      throw new Error(`${fieldName} must be a positive integer`);
    }

    return parsed;
  }

  private toNonNegativeInteger(value: unknown, fieldName: string): number {
    const parsed = this.toInteger(value, fieldName);
    if (parsed < 0) {
      throw new Error(`${fieldName} must be zero or positive`);
    }

    return parsed;
  }

  private normalizeItemContent(itemContentDto: ItemContentDto): ItemContentDto {
    const rawItem = itemContentDto as any;
    const id = `${rawItem.id ?? rawItem.item ?? ''}`.trim();
    if (!id) {
      throw new Error('Item id is required');
    }

    return {
      ...itemContentDto,
      id,
      amount: this.toPositiveInteger(rawItem.amount, 'amount'),
      slot: this.toNonNegativeInteger(rawItem.slot ?? 0, 'slot'),
      durability:
        rawItem.durability === undefined || rawItem.durability === null
          ? 0
          : this.toNonNegativeInteger(rawItem.durability, 'durability'),
    };
  }

  private normalizeItemContents(
    itemContentDto: ItemContentDto[]
  ): ItemContentDto[] {
    return itemContentDto.map((item) => this.normalizeItemContent(item));
  }

  /**
   * Method to find all Items
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.itemCRUD.getAll(findParams);
  }

  /**
   * Method to find specific Item by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.itemCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew Item
   * @param createItemDto : New object
   * @returns
   */
  async create(params: { createItemDto: CreateItemDto }): Promise<Output> {
    const { createItemDto } = params;
    return await this.itemCRUD.create(createItemDto);
  }

  /**
   * Method to update some Item data.
   * @param id : Item id that we want to change.
   * @param updateItemDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateItemDto: UpdateItemDto;
  }): Promise<Output> {
    const { id, updateItemDto } = params;
    return await this.itemCRUD.update(id, updateItemDto);
  }

  /**
   * Method to remove some Item object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.itemCRUD.remove(id);
  }

  /**
   * Method to get all Items and them prices
   * @returns Output
   */

  async getItemsWithPrices(): Promise<Output> {
    const items = await this.itemModel.find({ Tradeable: true }).exec();
    const response = [];
    for (let i = 0; i < items.length; i++) {
      const price = items[i].ItemValue;
      const item = {
        ItemID: items[i].ItemID,
        price,
      };
      response.push(item);
    }

    return {
      results: response,
      totalCount: items.length,
    };
  }

  /**
   * Method to buy one item recieving the id of the item and the amount and who is buying to witch cuki
   * @returns : Output
   * @param itemContentDto
   */
  // user Id comes from query, cukiId comes from params and the rest from body
  async buyItem(params: {
    userId: string;
    itemContentDto: ItemContentDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    let itemContentDto: ItemContentDto;
    try {
      itemContentDto = this.normalizeItemContent(params.itemContentDto);
    } catch (error) {
      this.throwMarketException(
        error,
        'Invalid item content',
        HttpStatus.BAD_REQUEST
      );
    }

    const user = await this.userModel.findById(userId).exec();
    const item = await this.itemModel
      .findOne({ ItemID: itemContentDto.id })
      .exec();
    if (!user || !item) {
      this.throwMarketError('User or Item not found', HttpStatus.NOT_FOUND);
    }
    if (!item.Tradeable) {
      this.throwMarketError('Item is not tradeable', HttpStatus.BAD_REQUEST);
    }
    const price = item.ItemValue;
    const totalPrice = +(price * itemContentDto.amount).toFixed(2);
    if (!user?.tokenBalance || totalPrice > user?.tokenBalance) {
      this.throwMarketError('Not enough tokens', HttpStatus.BAD_REQUEST);
    }
    let response = null;
    try {
      response = await this.inventoryService.addItemToInventory({
        userId,
        itemContentDto,
        cukiId,
        type: 'buy',
      });
    } catch (error) {
      this.throwMarketException(error, 'Error adding item to inventory');
    }
    this.assertMarketOutputSucceeded(response);

    user.tokenBalance = +(user.tokenBalance - totalPrice).toFixed(2);
    // create a movement
    const movement = new this.movementModel({
      movementType: 'buy-item',
      description: 'Buy one type of item',
      user: userId,
      items: [
        {
          itemId: item._id,
          itemValue: price,
          amount: itemContentDto.amount,
        },
      ],
      movementDate: Date.now(),
      movementValue: totalPrice,
      userBalance: user.tokenBalance,
      cuki: cukiId,
    });

    try {
      await movement.save();
    } catch (error) {
      await this.inventoryService.removeItemFromInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error creating movement');
    }
    try {
      await user.save();
    } catch (error) {
      await this.movementModel.deleteOne({ _id: movement._id });
      await this.inventoryService.removeItemFromInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error updating user');
    }

    return response;
  }

  /**
   * Method to sell items from inventory
   * @returns : Output
   * @param itemContentDto
   */
  async sellItem(params: {
    userId: string;
    itemContentDto: ItemContentDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    let itemContentDto: ItemContentDto;
    try {
      itemContentDto = this.normalizeItemContent(params.itemContentDto);
    } catch (error) {
      this.throwMarketException(
        error,
        'Invalid item content',
        HttpStatus.BAD_REQUEST
      );
    }

    const user = await this.userModel.findById(userId).exec();
    const item = await this.itemModel
      .findOne({ ItemID: itemContentDto.id })
      .exec();
    if (!user || !item) {
      this.throwMarketError('User or Item not found', HttpStatus.NOT_FOUND);
    }
    if (!item.Tradeable) {
      this.throwMarketError('Item is not tradeable', HttpStatus.BAD_REQUEST);
    }
    const price = item.ItemValue;
    const totalPrice = +(price * itemContentDto.amount).toFixed(2);

    let response = null;
    try {
      response = await this.inventoryService.removeItemFromInventory({
        userId,
        itemContentDto,
        cukiId,
        type: 'sell',
      });
    } catch (error) {
      this.throwMarketException(error, 'Error removing item from inventory');
    }
    this.assertMarketOutputSucceeded(response);
    if (!user.tokenBalance) {
      user.tokenBalance = 0;
    }
    user.tokenBalance = +(user.tokenBalance + totalPrice).toFixed(2);
    // create a movement
    const movement = new this.movementModel({
      movementType: 'sell-item',
      description: 'Sell one type of item',
      user: userId,
      items: [
        {
          itemId: item._id,
          itemValue: price,
          amount: itemContentDto.amount,
        },
      ],
      movementDate: Date.now(),
      movementValue: totalPrice,
      userBalance: user.tokenBalance,
      cuki: cukiId,
    });

    try {
      await movement.save();
    } catch (error) {
      await this.inventoryService.addItemToInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error creating movement');
    }
    try {
      await user.save();
    } catch (error) {
      await this.movementModel.deleteOne({ _id: movement._id });
      await this.inventoryService.addItemToInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error updating user');
    }

    return response;
  }

  /**
   * Method to buy more than one item from inventory
   * @returns : Output
   * @param itemContentDto
   */

  async buyItems(params: {
    userId: string;
    itemContentDto: ItemContentDto[];
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    let itemContentDto: ItemContentDto[];
    try {
      itemContentDto = this.normalizeItemContents(params.itemContentDto);
    } catch (error) {
      this.throwMarketException(
        error,
        'Invalid item content',
        HttpStatus.BAD_REQUEST
      );
    }
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      this.throwMarketError('User not found', HttpStatus.NOT_FOUND);
    }
    let totalPrice = 0;
    const items = [];
    for (let i = 0; i < itemContentDto.length; i++) {
      const item = await this.itemModel
        .findOne({ ItemID: itemContentDto[i].id })
        .exec();
      if (!item) {
        this.throwMarketError(
          `Item ${itemContentDto[i].id} not found`,
          HttpStatus.NOT_FOUND
        );
      }
      if (!item.Tradeable) {
        this.throwMarketError(
          `Item ${itemContentDto[i].id} is not tradeable`,
          HttpStatus.BAD_REQUEST
        );
      }
      const price = item.ItemValue;
      totalPrice += +(price * itemContentDto[i].amount).toFixed(2);
      items.push({
        itemId: item._id,
        itemValue: price,
        amount: itemContentDto[i].amount,
      });
    }
    if (!user?.tokenBalance || totalPrice > user?.tokenBalance) {
      this.throwMarketError('Not enough tokens', HttpStatus.BAD_REQUEST);
    }

    let response = null;
    try {
      response = await this.inventoryService.addItemsToInventory({
        userId,
        itemContentDto,
        cukiId,
        type: 'buy',
      });
    } catch (error) {
      this.throwMarketException(error, 'Error adding items to inventory');
    }
    this.assertMarketOutputSucceeded(response);

    user.tokenBalance = +(user.tokenBalance - totalPrice).toFixed(2);

    const movement = new this.movementModel({
      movementType: 'buy-item',
      description: 'Buy multiple items',
      user: userId,
      items,
      movementDate: Date.now(),
      movementValue: totalPrice,
      userBalance: user.tokenBalance,
      cuki: cukiId,
    });
    try {
      await movement.save();
    } catch (error) {
      await this.inventoryService.removeItemsFromInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error creating movement');
    }
    try {
      await user.save();
    } catch (error) {
      await this.movementModel.deleteOne({ _id: movement._id });
      await this.inventoryService.removeItemsFromInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error updating user');
    }

    return response;
  }
  /**
   * Method to sell more than one item from inventory
   * @returns : Output
   * @param itemContentDto
   */

  async sellItems(params: {
    userId: string;
    itemContentDto: ItemContentDto[];
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, cukiId } = params;
    let itemContentDto: ItemContentDto[];
    try {
      itemContentDto = this.normalizeItemContents(params.itemContentDto);
    } catch (error) {
      this.throwMarketException(
        error,
        'Invalid item content',
        HttpStatus.BAD_REQUEST
      );
    }
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      this.throwMarketError('User not found', HttpStatus.NOT_FOUND);
    }
    let totalPrice = 0;
    const items = [];
    for (let i = 0; i < itemContentDto.length; i++) {
      const item = await this.itemModel
        .findOne({ ItemID: itemContentDto[i].id })
        .exec();
      if (!item) {
        this.throwMarketError(
          `Item ${itemContentDto[i].id} not found`,
          HttpStatus.NOT_FOUND
        );
      }
      if (!item.Tradeable) {
        this.throwMarketError(
          `Item ${itemContentDto[i].id} is not tradeable`,
          HttpStatus.BAD_REQUEST
        );
      }
      const price = item.ItemValue;
      totalPrice += +(price * itemContentDto[i].amount).toFixed(2);
      items.push({
        itemId: item._id,
        itemValue: price,
        amount: itemContentDto[i].amount,
      });
    }

    let response = null;
    try {
      response = await this.inventoryService.removeItemsFromInventory({
        userId,
        itemContentDto,
        cukiId,
        type: 'sell',
      });
    } catch (error) {
      this.throwMarketException(error, 'Error removing items from inventory');
    }
    this.assertMarketOutputSucceeded(response);

    if (!user.tokenBalance) {
      user.tokenBalance = 0;
    }
    user.tokenBalance = +(user.tokenBalance + totalPrice).toFixed(2);
    const movement = new this.movementModel({
      movementType: 'sell-item',
      description: 'Sell multiple items',
      user: userId,
      items,
      movementDate: Date.now(),
      movementValue: totalPrice,
      userBalance: user.tokenBalance,
      cuki: cukiId,
    });
    try {
      await movement.save();
    } catch (error) {
      await this.inventoryService.addItemsToInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error creating movement');
    }
    try {
      await user.save();
    } catch (error) {
      await this.movementModel.deleteOne({ _id: movement._id });
      await this.inventoryService.addItemsToInventory({
        userId,
        itemContentDto,
        cukiId,
        error: true,
      });
      this.throwMarketException(error, 'Error updating user');
    }

    return response;
  }
}
