import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Map,
  MapDocument,
  ResourceMap,
  ResourceMapDocument,
} from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateResourceMapDto } from './dto/create-resourceMap.dto';
import { UpdateResourceMapDto } from './dto/update-resourceMap.dto';

@Injectable()
export class ResourceMapService {
  private resourceMapCRUD: CRUD = null;
  private mapCRUD: CRUD = null;
  constructor(
    @InjectModel(ResourceMap.name, 'gameDB')
    private ResourceMapModel: Model<ResourceMapDocument>,

    @InjectModel(Map.name, 'gameDB')
    private MapModel: Model<MapDocument>
  ) {
    this.resourceMapCRUD = new CRUD(this.ResourceMapModel);
    this.mapCRUD = new CRUD(this.MapModel);
  }

  /**
   * Method to find all ResourceMaps
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.resourceMapCRUD.getAll(findParams);
  }

  /**
   * Method to find specific ResourceMap by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.resourceMapCRUD.getOne({
      filterQuery: {
        _id: id,
      },
    });
  }

  /**
   * Method to create a bew ResourceMap
   * @param createResourceMapDto : New object
   * @returns
   */
  async create(params: {
    createResourceMapDto: CreateResourceMapDto;
  }): Promise<Output> {
    const { createResourceMapDto } = params;
    const map = await this.mapCRUD.getOne({
      filterQuery: {
        _id: createResourceMapDto.map,
      },
    });

    //If the message exists it means there was an error.
    if (map['message']) return map;

    createResourceMapDto.data = JSON.parse(createResourceMapDto.data);
    createResourceMapDto.name = `${map['results'][0].name}_resourceMap_${map['results'][0].resourceMaps.length}`;

    const resourceMap = await this.resourceMapCRUD.create(createResourceMapDto);
    if (map['message']) return map;
    // Update map with new resourceMap
    map['results'][0].resourceMaps.push(resourceMap['results'][0]['_id']);
    await this.mapCRUD.update(map['results'][0]._id, map['results'][0]);
    return resourceMap;
  }

  /**
   * Method to update some ResourceMap data.
   * @param id : ResourceMap id that we want to change.
   * @param updateResourceMapDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateResourceMapDto: UpdateResourceMapDto;
  }): Promise<Output> {
    const { id, updateResourceMapDto } = params;
    return await this.resourceMapCRUD.update(id, updateResourceMapDto);
  }

  /**
   * Method to remove some ResourceMap object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.resourceMapCRUD.remove(id);
  }
}
