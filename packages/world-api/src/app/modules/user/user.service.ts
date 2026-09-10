import { IGet, Output } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import { User, UserDocument } from '@cukies/world-shared';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserMapService } from '../userMap/userMap.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService implements OnModuleInit {
  private userCRUD: CRUD | null = null;
  private userMapService: UserMapService;

  constructor(
    private moduleRef: ModuleRef,
    @InjectModel(User.name, 'cukiesDB')
    private userModel: Model<UserDocument>
  ) {
    this.userCRUD = new CRUD(this.userModel);
  }

  onModuleInit() {
    this.userMapService = this.moduleRef.get(UserMapService, { strict: false });
  }

  /**
   * Method to find all Users
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.userCRUD.getAll(findParams);
  }

  /**
   * Method to find specific User by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.userCRUD.getOne({ filterQuery: { _id: id } });
  }

  /**
   * Method to create a bew User
   * @param createUserDto : New object
   * @returns
   */
  async create(params: { createUserDto: CreateUserDto }): Promise<Output> {
    const { createUserDto } = params;
    return await this.userCRUD.create(createUserDto);
  }

  /**
   * Method to update some User data.
   * @param id : User id that we want to change.
   * @param updateUserDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateUserDto: UpdateUserDto;
    userId?: string;
  }): Promise<Output> {
    const { id, updateUserDto, userId } = params;
    if (userId) await this.updateLastChange({ userId, lastChange: 'user' });

    return await this.userCRUD.update(id, updateUserDto);
  }

  /**
   * Method to remove some User object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.userCRUD.remove(id);
  }

  /**
   * Method to update the last change that the user has made in the game.
   * @param userId : Id of the user that we want to update.
   * @param lastChange : Last change that the user has made.
   * @returns
   */
  async updateLastChange(params: { userId: string; lastChange: string }) {
    const { userId, lastChange } = params;

    const data = await this.userModel.findById(userId);
    if (!data) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Insert or replace the last change in lastChanges array
    data.lastChanges = data.lastChanges.filter(
      (change) => change.category !== lastChange
    );
    data.lastChanges.push({
      category: lastChange,
      timestamp: new Date().getTime(),
    });

    data.save();
  }

  async getUserFromToken(params: { userId: string }): Promise<Output> {
    const { userId } = params;

    const data = await this.userModel.findById(userId);
    if (!data) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // if the user doesn't have a map, we create one
    let userMaps;
    try {
      userMaps = await this.userMapService.findAllFromToken({ userId });
    } catch (error) {
      console.log('Error getting user maps', error);
      return { code: 404, message: 'Error getting user maps' };
    }

    const firstMap = userMaps?.results?.[0];
    if (firstMap?._id) {
      const hasMap = (data.maps || []).some(
        (mapId) => String(mapId) === String(firstMap._id)
      );
      if (!hasMap) {
        data.maps.push(firstMap._id);
      }
    }

    // remove password from data
    if (data.password) {
      data['password'] = '';
    }

    const response: Output = {
      totalCount: 1,
      results: [data],
    };

    return response;
  }
}
