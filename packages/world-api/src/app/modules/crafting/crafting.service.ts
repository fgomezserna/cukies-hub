import {
  IGet,
  IResponseCRUD,
  Output,
  isResponse,
} from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Crafting,
  CraftingDocument,
  Inventory,
  InventoryDocument,
  Item,
  ItemDocument,
} from '@cukies/world-shared';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InventoryService } from '../inventory/inventory.service';
import { CukiService } from './../cuki/cuki.service';
import { CreateCraftingDto } from './dto/create-crafting.dto';
import { UpdateCraftingDto } from './dto/update-crafting.dto';

@Injectable()
export class CraftingService implements OnModuleInit {
  private craftingCRUD: CRUD | null = null;
  private inventoryService: InventoryService;
  private cukiService: CukiService;

  constructor(
    private moduleRef: ModuleRef,
    @InjectModel(Crafting.name, 'gameDB')
    private craftingModel: Model<CraftingDocument>,
    @InjectModel(Inventory.name, 'gameDB')
    private inventoryModel: Model<InventoryDocument>,
    @InjectModel(Item.name, 'gameDB')
    private itemModel: Model<ItemDocument>
  ) {
    this.craftingCRUD = new CRUD(this.craftingModel);
  }
  onModuleInit() {
    this.inventoryService = this.moduleRef.get(InventoryService, {
      strict: false,
    });
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

  private normalizeRequirement(requirement) {
    const id = `${requirement?.id ?? requirement?.item ?? ''}`.trim();
    if (!id) {
      throw new HttpException('Item id is required', HttpStatus.BAD_REQUEST);
    }

    const amount = this.toInteger(requirement.amount, 'amount');
    if (amount <= 0) {
      throw new HttpException('amount must be positive', HttpStatus.BAD_REQUEST);
    }

    const slot = this.toInteger(requirement.slot ?? 0, 'slot');
    if (slot < 0) {
      throw new HttpException('slot must be zero or positive', HttpStatus.BAD_REQUEST);
    }

    const durability =
      requirement.durability === undefined || requirement.durability === null
        ? 0
        : this.toInteger(requirement.durability, 'durability');

    return {
      id,
      amount,
      slot,
      durability,
    };
  }

  private aggregateRequirements(requirements) {
    const bySlot = new Map<string, any>();
    for (const requirement of requirements) {
      const key = `${requirement.id}:${requirement.slot}`;
      const existing = bySlot.get(key);
      if (existing) {
        existing.amount += requirement.amount;
      } else {
        bySlot.set(key, { ...requirement });
      }
    }

    return Array.from(bySlot.values());
  }

  /**
   * Method to find all Inventories
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.craftingCRUD.getAll(findParams);
  }

  /**
   * Method to find specific crafting by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.craftingCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew crafting
   * @param createcraftingDto : New object
   * @returns
   */
  async create(params: {
    createCraftingDto: CreateCraftingDto;
  }): Promise<Output> {
    const { createCraftingDto } = params;
    return await this.craftingCRUD.create(createCraftingDto);
  }

  /**
   * Method to update some crafting data.
   * @param id : crafting id that we want to change.
   * @param updatecraftingDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateCraftingDto: UpdateCraftingDto;
  }): Promise<Output> {
    const { id, updateCraftingDto } = params;
    return await this.craftingCRUD.update(id, updateCraftingDto);
  }

  /**
   * Method to remove some crafting object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.craftingCRUD.remove(id);
  }

  /**
   * Method craft an item
   * @param userId: Id of the user that we want to check the crafting.
   * @param craftingId: Id of the crafting that we want to check the crafting.
   * @returns : Output
   */
  async craftItem(params: {
    userId: string;
    crafting: CreateCraftingDto;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId, crafting, cukiId } = params;
    if (cukiId) await this.cukiService.checkCukiOwner({ userId, cukiId });
    const inventoryResults = await this.inventoryService.getInventory({
      userId,
      cukiId,
    });
    if (isResponse(inventoryResults)) {
      return inventoryResults;
    }
    if (!inventoryResults?.results[0])
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
    const inventory: InventoryDocument = inventoryResults.results[0];
    // el primer item del array de crafting es el item que se craftea... el resto son los ingredientes que se tienen que borrar
    if (!Array.isArray(crafting.requirements) || crafting.requirements.length < 2) {
      throw new HttpException(
        'Crafting requirements must include output and ingredients',
        HttpStatus.BAD_REQUEST
      );
    }
    const craft = crafting.requirements.map((requirement) =>
      this.normalizeRequirement(requirement)
    );
    const craftItem = craft[0];
    const receits = this.aggregateRequirements(craft.slice(1));

    const craftItemFound = await this.itemModel.findOne({
      ItemID: craftItem.id,
    });
    if (!craftItemFound) {
      throw new HttpException(
        'Item not found, check if it`s in DB',
        HttpStatus.NOT_FOUND
      );
    }

    for (const receipt of receits) {
      const receiptItemFound = await this.itemModel.findOne({
        ItemID: receipt.id,
      });
      if (!receiptItemFound) {
        throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
      }

      const inventoryItem = inventory.content.find(
        (item) => item.slot === receipt.slot && item.id === receipt.id
      );
      if (!inventoryItem || inventoryItem.amount < receipt.amount) {
        throw new HttpException(
          `Not enough ${receipt.id} in slot ${receipt.slot}`,
          HttpStatus.BAD_REQUEST
        );
      }
    }

    for (const receipt of receits) {
      const inventoryItem = inventory.content.find(
        (item) => item.slot === receipt.slot && item.id === receipt.id
      );
      inventoryItem.amount -= receipt.amount;
    }

    inventory.content = inventory.content.filter((item) => item.amount > 0);

    const outputSlotItem = inventory.content.find(
      (item) => item.slot === craftItem.slot
    );
    if (outputSlotItem && outputSlotItem.id !== craftItem.id) {
      throw new HttpException('Craft output slot is occupied', HttpStatus.CONFLICT);
    }

    if (outputSlotItem && outputSlotItem.id === craftItem.id) {
      outputSlotItem.amount += craftItem.amount;
      outputSlotItem.durability = craftItem.durability;
    } else {
      inventory.content.push(craftItem);
    }

    const data = await inventory.save();
    const output: IResponseCRUD = {
      totalCount: 1,
      results: [data],
    };
    return output;
  }
}
