import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import { Map, MapDocument } from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';

@Injectable()
export class MapService {
  private mapCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Map.name, 'gameDB')
    private itemModel: Model<MapDocument>
  ) {
    this.mapCRUD = new CRUD(this.itemModel);
  }

  /**
   * Method to find all Maps
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.mapCRUD.getAll(findParams);
  }

  /**
   * Method to find specific Map by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.mapCRUD.getOne({ filterQuery: { _id: id } });
  }

  /**
   * Method to create a bew Map
   * @param createMapDto : New object
   * @returns
   */
  async create(params: { createMapDto: CreateMapDto }): Promise<Output> {
    const { createMapDto } = params;
    createMapDto.data = JSON.parse(createMapDto.data);
    return await this.mapCRUD.create(createMapDto);
  }

  /**
   * Method to update some Map data.
   * @param id : Map id that we want to change.
   * @param updateMapDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateMapDto: UpdateMapDto;
  }): Promise<Output> {
    const { id, updateMapDto } = params;
    return await this.mapCRUD.update(id, updateMapDto);
  }

  /**
   * Method to remove some Map object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.mapCRUD.remove(id);
  }
}
