import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  MissionGroup,
  MissionGroupDocument,
} from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMissionGroupDto } from './dto/create-missionGroup.dto';
import { UpdateMissionGroupDto } from './dto/update-missionGroup.dto';

@Injectable()
export class MissionGroupService {
  private missionGroupCRUD: CRUD | null = null;
  constructor(
    @InjectModel(MissionGroup.name, 'gameDB')
    private itemModel: Model<MissionGroupDocument>
  ) {
    this.missionGroupCRUD = new CRUD(this.itemModel);
  }

  /**
   * Method to find all MissionGroups
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.missionGroupCRUD.getAll(findParams);
  }

  /**
   * Method to find specific MissionGroup by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionGroupCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew MissionGroup
   * @param createMissionGroupDto : New object
   * @returns
   */
  async create(params: {
    createMissionGroupDto: CreateMissionGroupDto;
  }): Promise<Output> {
    const { createMissionGroupDto } = params;
    return await this.missionGroupCRUD.create(createMissionGroupDto);
  }

  /**
   * Method to update some MissionGroup data.
   * @param id : MissionGroup id that we want to change.
   * @param updateMissionGroupDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateMissionGroupDto: UpdateMissionGroupDto;
  }): Promise<Output> {
    const { id, updateMissionGroupDto } = params;
    return await this.missionGroupCRUD.update(id, updateMissionGroupDto);
  }

  /**
   * Method to remove some MissionGroup object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionGroupCRUD.remove(id);
  }
}
