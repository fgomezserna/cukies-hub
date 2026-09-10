import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import { Mission, MissionDocument } from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMissionDto } from './dto/create-mission.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';

@Injectable()
export class MissionService {
  private missionCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Mission.name, 'gameDB')
    private itemModel: Model<MissionDocument>
  ) {
    this.missionCRUD = new CRUD(this.itemModel);
  }

  /**
   * Method to find all Missions
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.missionCRUD.getAll(findParams);
  }

  /**
   * Method to find specific Mission by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew Mission
   * @param createMissionDto : New object
   * @returns
   */
  async create(params: {
    createMissionDto: CreateMissionDto;
  }): Promise<Output> {
    const { createMissionDto } = params;
    return await this.missionCRUD.create(createMissionDto);
  }

  /**
   * Method to update some Mission data.
   * @param id : Mission id that we want to change.
   * @param updateMissionDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateMissionDto: UpdateMissionDto;
  }): Promise<Output> {
    const { id, updateMissionDto } = params;
    return await this.missionCRUD.update(id, updateMissionDto);
  }

  /**
   * Method to remove some Mission object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionCRUD.remove(id);
  }
}
