import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import { Stats, StatsDocument } from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateStatsDto } from './dto/create-stats.dto';
import { ItemHistoryDto } from './dto/item-history.dto';
import { UpdateStatsDto } from './dto/update-stats.dto';

@Injectable()
export class StatsService {
  private statsCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Stats.name, 'gameDB')
    private statsModel: Model<StatsDocument>
  ) {
    this.statsCRUD = new CRUD(this.statsModel);
  }

  /**
   * Method to find all statss
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.statsCRUD.getAll(findParams);
  }

  /**
   * Method to find specific stats by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.statsCRUD.getOne({ filterQuery: { _id: id } });
  }

  /**
   * Method to create a bew stats
   * @param createStatsDto : New object
   * @returns
   */
  async create(params: { createStatsDto: CreateStatsDto }): Promise<Output> {
    const { createStatsDto } = params;
    return await this.statsCRUD.create(createStatsDto);
  }

  /**
   * Method to update some stats data.
   * @param id : stats id that we want to change.
   * @param updateStatsDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateStatsDto: UpdateStatsDto;
  }): Promise<Output> {
    const { id, updateStatsDto } = params;
    return await this.statsCRUD.update(id, updateStatsDto);
  }

  /**
   * Method to remove some stats object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.statsCRUD.remove(id);
  }

  /**
   * Method that check if the stats object with the userId exists.
   * @param userId : Id of user to check.
   * @returns
   */
  async getStats(params: { userId: string }): Promise<Output> {
    const { userId } = params;

    const data = await this.statsModel.find({ user: userId });

    if (data.length === 0) {
      const newStats = await this.create({
        createStatsDto: {
          user: userId,
          itemHistory: [],
        },
      });

      return { totalCount: 1, results: [newStats] };
    }

    return { totalCount: 1, results: [data] };
  }

  /**
   * Method to add a new item in "itemHistory" array.
   * @param userId : Id of user to update.
   * @param itemHistoryDto: New item to add.
   * @returns
   */
  async addItemToHistory(params: {
    userId: string;
    itemHistoryDto: ItemHistoryDto;
  }): Promise<Output> {
    const { userId, itemHistoryDto } = params;

    // insert the current date in the item
    itemHistoryDto.date = new Date().getTime();

    const data = await this.statsModel.findOneAndUpdate(
      { user: userId },
      { $push: { itemHistory: itemHistoryDto } },
      { new: true }
    );

    return { totalCount: 1, results: [data] };
  }
}
