import { IGet, Output } from '../interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Model, SortOrder, Types } from 'mongoose';
export class CRUD {
  private model: Model<any>;
  constructor(model: Model<any>) {
    this.model = model;
  }

  async getAll({
    filterQuery = {},
    order = 'asc',
    limit = 1000,
    skip = 0,
    populate = [],
  }: IGet): Promise<Output> {
    // const sortType = (params.skip == 'asc': -1 ? 1)
    let sortType: SortOrder = 1;
    if (order.toLocaleLowerCase() == 'asc') {
      sortType = -1;
    }

    // create regex for every filter
    for (const key in filterQuery) {
      // check if filterQuery[key] have the key value and options
      if (filterQuery[key].value && filterQuery[key].options) {
        const value = filterQuery[key].value;
        const options = filterQuery[key].options;
        filterQuery[key] = new RegExp(value, options);
      }
    }

    const data = await this.model
      .find(filterQuery)
      .sort({ timeStamp: sortType })
      .limit(limit)
      .populate(populate)
      .skip(skip);

    // Mongoose 8 exposes countDocuments. Keep the legacy count fallback for
    // offline fixtures and older model doubles used by the ported domain tests.
    const count = (this.model as any).countDocuments ?? (this.model as any).count;
    const size = await count.call(this.model, filterQuery);
    const result: Output = {
      totalCount: size,
      results: data,
    };

    return result;
  }

  /**
   * In the getOne method there is an id restriction, which has to be of type MongoOBJ,
   * however Cuki ids are a simple string.
   * The second parameter is used to override this restriction.
   * @param IGet: Object with the parameters to filter the query.
   * @param isCuki: Parameter indicating if the passed parameter belongs to Cuki or not.
   * @returns Object found
   */
  async getOne({ filterQuery = {}, populate = [] }: IGet): Promise<Output> {
    for (const key in filterQuery) {
      // check if filterQuery[key] have the key value and options
      if (filterQuery[key].value && filterQuery[key].options) {
        const value = filterQuery[key].value;
        const options = filterQuery[key].options;
        filterQuery[key] = new RegExp(value, options);
      }
    }

    const data = await this.model.findOne(filterQuery).populate(populate);
    const count = (this.model as any).countDocuments ?? (this.model as any).count;
    const size = await count.call(this.model, filterQuery);

    const result: Output = {
      totalCount: size,
      results: [data],
    };
    return result;
  }

  async getOneWithToken(params: IGet): Promise<Output> {
    return this.getOne(params);
  }

  async create(createItemDto: any, populate: string[] = []): Promise<Output> {
    let data = await this.model.create(createItemDto);

    // populate data
    if (populate.length > 0) {
      data = await this.model.findById(data._id).populate(populate).exec();
    }
    const result: Output = {
      totalCount: 1,
      results: [data],
    };
    return result;
  }

  /**
   * In the getOne method there is an id restriction, which has to be of type MongoOBJ,
   * however Cuki ids are a simple string.
   * The second parameter is used to override this restriction.
   * @param id: Id of the object searched
   * @param updateItemDto
   * @param isCuki: Parameter indicating if the passed parameter belongs to Cuki or not.
   * @returns
   */
  async update(
    id: string,
    updateItemDto: any,
    isCuki?: boolean
  ): Promise<Output> {
    this.checkData({ id, isCuki });

    const updatedCampaign = await this.model.findByIdAndUpdate(
      id,
      updateItemDto,
      {
        new: true,
      }
    );

    const result: Output = {
      totalCount: 1,
      results: [updatedCampaign],
    };
    return result;
  }

  /**
   * In the getOne method there is an id restriction, which has to be of type MongoOBJ,
   * however Cuki ids are a simple string.
   * The second parameter is used to override this restriction.
   * @param id: Id of the object searched
   * @param isCuki: Parameter indicating if the passed parameter belongs to Cuki or not.
   * @returns
   */
  async remove(id: string, isCuki?: boolean): Promise<Output> {
    this.checkData({ id, isCuki });

    const deletedItem = await this.model.findByIdAndDelete(id);
    const result: Output = {
      totalCount: 1,
      results: [deletedItem],
    };
    return result;
  }

  /**
   * Method to validate if the mongo idObject has the correct form or not.
   * @param id: Id to validate.
   * @returns response in Boolean format.
   */
  checkId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  /**
   * Check data
   */
  async checkData({ id, isCuki }: { id: string; isCuki?: boolean }): Promise<boolean> {
    const check_id = this.checkId(id);
    if (!check_id && !isCuki)
      throw new HttpException(
        'The Id has an invalid format.',
        HttpStatus.BAD_REQUEST
      );

    const exist = await this.model.findOne({ _id: id });
    if (!exist) {
      throw new HttpException('No object found', HttpStatus.NOT_FOUND);
    }

    return true;
  }
}
