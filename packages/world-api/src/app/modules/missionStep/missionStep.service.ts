import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  MissionStep,
  MissionStepDocument,
} from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMissionStepDto } from './dto/create-missionStep.dto';
import { UpdateMissionStepDto } from './dto/update-missionStep.dto';

@Injectable()
export class MissionStepService {
  private missionStepCRUD: CRUD | null = null;
  constructor(
    @InjectModel(MissionStep.name, 'gameDB')
    private MissionStepModel: Model<MissionStepDocument>
  ) {
    this.missionStepCRUD = new CRUD(this.MissionStepModel);
  }

  /**
   * Method to find all MissionSteps
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.missionStepCRUD.getAll(findParams);
  }

  /**
   * Method to find specific MissionStep by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionStepCRUD.getOne({
      filterQuery: { _id: id },
    });
  }

  /**
   * Method to create a bew MissionStep
   * @param createMissionStepDto : New object
   * @returns
   */
  async create(params: {
    createMissionStepDto: CreateMissionStepDto;
  }): Promise<Output> {
    const { createMissionStepDto } = params;
    return await this.missionStepCRUD.create(createMissionStepDto);
  }

  /**
   * Method to update some MissionStep data.
   * @param id : MissionStep id that we want to change.
   * @param updateMissionStepDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateMissionStepDto: UpdateMissionStepDto;
  }): Promise<Output> {
    const { id, updateMissionStepDto } = params;
    return await this.missionStepCRUD.update(id, updateMissionStepDto);
  }

  /**
   * Method to remove some MissionStep object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.missionStepCRUD.remove(id);
  }
}
