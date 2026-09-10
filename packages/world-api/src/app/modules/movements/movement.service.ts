import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Movement,
  MovementDocument,
} from '@cukies/world-shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class MovementService {
  private movementCRUD: CRUD | null = null;
  constructor(
    @InjectModel(Movement.name, 'gameDB')
    private movementModel: Model<MovementDocument>
  ) {
    this.movementCRUD = new CRUD(this.movementModel);
  }

  // method to create a new Movement
  async createMovement(params: { movement: Movement }): Promise<Output> {
    const { movement } = params;
    return await this.movementCRUD.create(movement);
  }

  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.movementCRUD.getAll(findParams);
  }

  async getUserMovements(params: {
    userId: string;
    cukiId: string | undefined;
  }): Promise<Output> {
    const { userId } = params;
    try {
      const query = { user: userId };
      if (params?.cukiId) {
        query['cuki'] = params?.cukiId;
      }
      const movements = await this.movementModel
        .find(query)
        .populate({
          path: 'items.itemId',
          select: 'ItemID -_id',
        })
        .exec();
      return {
        totalCount: movements.length,
        results: movements,
      };
    } catch (err) {
      console.error(err);
      return {
        message: 'Could not get the movements',
        code: 500,
      };
    }
  }
}
