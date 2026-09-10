import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Building,
  BuildingDocument,
} from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@Injectable()
export class BuildingService {
  private buildingCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Building.name, 'gameDB')
    private buildingModel: Model<BuildingDocument>
  ) {
    this.buildingCRUD = new CRUD(this.buildingModel);
  }

  /**
   * Method to find all Inventories
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.buildingCRUD.getAll(findParams);
  }

  /**
   * Method to find specific building by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.buildingCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew building
   * @param createBuildingDto : New object
   * @returns
   */
  async create(params: {
    createBuildingDto: CreateBuildingDto;
  }): Promise<Output> {
    const { createBuildingDto } = params;
    return await this.buildingCRUD.create(createBuildingDto);
  }

  /**
   * Method to update some building data.
   * @param id : building id that we want to change.
   * @param updateBuildingDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateBuildingDto: UpdateBuildingDto;
  }): Promise<Output> {
    const { id, updateBuildingDto } = params;
    return await this.buildingCRUD.update(id, updateBuildingDto);
  }

  /**
   * Method to remove some building object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.buildingCRUD.remove(id);
  }

  /**
   * Method to find one building by id only with token.
   * @param id
   * @returns
   */
  async findOneWithToken(id: string): Promise<Output> {
    return await this.buildingCRUD.getOneWithToken({
      filterQuery: { _id: id },
    });
  }
}
