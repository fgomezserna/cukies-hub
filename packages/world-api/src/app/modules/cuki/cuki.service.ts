import {
  IGet,
  IResponse,
  IResponseCRUD,
  Output,
} from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  Cukie as Cuki,
  CukieDocument as CukiDocument,
  CukiMission,
  CukiMissionDocument,
  Mission,
  MissionDocument,
  User,
  UserDocument,
} from '@cukies/world-shared';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddExpDto } from './dto/add-exp.dto';
import { CreateCukiDto } from './dto/create-cuki.dto';
import { InGameStatsDto } from './dto/in-game-stats.dto';
import { LevelUpDto } from './dto/level-up.dto';
import { UpdateCukiDto } from './dto/update-cuki.dto';

@Injectable()
export class CukiService {
  private cukiCRUD: CRUD | null = null;
  private readonly fullRecoveryAfterMs = 8 * 60 * 60 * 1000;
  private readonly restoredStatsGraceMs = 2 * 60 * 1000;
  private readonly fullRecoveryCategory = 'last-full-recovery';
  private readonly recoveryChangeCategories = ['last-activity', 'last-bedrest'];
  private readonly skillKeys = [
    'miner',
    'engineer',
    'farmer',
    'gatherer',
    'scout',
    'breeder',
    'life',
    'energy',
    'generation',
  ];

  constructor(
    @InjectModel(Cuki.name, 'cukiesDB')
    private cukiModel: Model<CukiDocument>,
    @InjectModel(User.name, 'cukiesDB')
    private userModel: Model<UserDocument>,
    @InjectModel(Mission.name, 'gameDB')
    private missionModel: Model<MissionDocument>,
    @InjectModel(CukiMission.name, 'gameDB')
    private cukiMissionModel: Model<CukiMissionDocument>
  ) {
    this.cukiCRUD = new CRUD(this.cukiModel);
  }

  private normalizeSkill(skill: string): string {
    const normalizedSkill = skill === 'cook' ? 'scout' : skill;
    if (!this.skillKeys.includes(normalizedSkill)) {
      throw new HttpException('Invalid skill', HttpStatus.BAD_REQUEST);
    }

    return normalizedSkill;
  }

  private assertPositiveNumber(value: unknown, fieldName: string): number {
    const numberValue =
      typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      throw new HttpException(
        `${fieldName} must be positive`,
        HttpStatus.BAD_REQUEST
      );
    }

    return numberValue;
  }

  private toNonNegativeNumber(value: unknown, fallback = 0): number {
    const numberValue =
      typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }

    return Math.max(0, numberValue);
  }

  private normalizeTimestampMs(value: unknown): number | undefined {
    const timestamp = this.toNonNegativeNumber(value, 0);
    if (timestamp <= 0) {
      return undefined;
    }

    // Legacy payloads can store seconds, while backend writes milliseconds.
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }

  private getLatestTimestamp(
    cuki: CukiDocument,
    categories: string[]
  ): number | undefined {
    const lastChanges = Array.isArray(cuki.lastChanges)
      ? cuki.lastChanges
      : [];
    let latestTimestamp: number | undefined;

    for (const change of lastChanges) {
      if (!categories.includes(change?.category)) {
        continue;
      }
      const timestamp = this.normalizeTimestampMs(change?.timestamp);
      if (
        timestamp !== undefined &&
        (latestTimestamp === undefined || timestamp > latestTimestamp)
      ) {
        latestTimestamp = timestamp;
      }
    }

    return latestTimestamp;
  }

  private getLatestRecoveryTimestamp(cuki: CukiDocument): number | undefined {
    return this.getLatestTimestamp(cuki, this.recoveryChangeCategories);
  }

  private shouldRestoreFullStats(cuki: CukiDocument): boolean {
    const latestTimestamp = this.getLatestRecoveryTimestamp(cuki);
    if (latestTimestamp === undefined) {
      return true;
    }

    return Date.now() - latestTimestamp >= this.fullRecoveryAfterMs;
  }

  private wasRecentlyFullRecovered(cuki: CukiDocument): boolean {
    const latestTimestamp = this.getLatestTimestamp(cuki, [
      this.fullRecoveryCategory,
    ]);
    if (latestTimestamp === undefined) {
      return false;
    }

    return Date.now() - latestTimestamp <= this.restoredStatsGraceMs;
  }

  private updateLastChangeTimestamp(
    cuki: CukiDocument,
    category: string,
    timestamp: number
  ): void {
    if (!Array.isArray(cuki.lastChanges)) {
      cuki.lastChanges = [];
    }

    const index = cuki.lastChanges.findIndex(
      (change) => change?.category === category
    );
    if (index !== -1) {
      cuki.lastChanges[index].timestamp = timestamp;
      return;
    }

    cuki.lastChanges.push({ category, timestamp });
  }

  private isZeroStatUpdate(value: unknown): boolean {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue <= 0;
  }

  private shouldIgnoreStaleZeroStatsUpdate(
    cuki: CukiDocument,
    inGameStatsDto: InGameStatsDto
  ): boolean {
    return (
      this.wasRecentlyFullRecovered(cuki) &&
      this.isZeroStatUpdate(inGameStatsDto?.life) &&
      this.isZeroStatUpdate(inGameStatsDto?.energy)
    );
  }

  private applyInGameStatsUpdate(
    cuki: CukiDocument,
    inGameStatsDto: InGameStatsDto
  ): boolean {
    if (!inGameStatsDto || typeof inGameStatsDto !== 'object') {
      return false;
    }

    let bChanged = false;
    const cukiAny = cuki as any;
    if (!cukiAny.inGameStats || typeof cukiAny.inGameStats !== 'object') {
      cukiAny.inGameStats = {};
      bChanged = true;
    }

    const bIgnoreStaleZeroStatsUpdate =
      this.shouldIgnoreStaleZeroStatsUpdate(cuki, inGameStatsDto);

    if (
      inGameStatsDto.xp &&
      typeof inGameStatsDto.xp === 'object' &&
      !Array.isArray(inGameStatsDto.xp)
    ) {
      if (
        !cukiAny.inGameStats.xp ||
        typeof cukiAny.inGameStats.xp !== 'object'
      ) {
        cukiAny.inGameStats.xp = {};
        bChanged = true;
      }

      for (const skill of this.skillKeys) {
        const xp = inGameStatsDto.xp[skill];
        if (xp !== undefined && cukiAny.inGameStats.xp[skill] !== xp) {
          cukiAny.inGameStats.xp[skill] = xp;
          bChanged = true;
        }
      }
    }

    for (const stat of ['life', 'energy']) {
      const value = inGameStatsDto[stat];
      if (value === undefined) {
        continue;
      }
      if (bIgnoreStaleZeroStatsUpdate && this.isZeroStatUpdate(value)) {
        continue;
      }
      if (cukiAny.inGameStats[stat] !== value) {
        cukiAny.inGameStats[stat] = value;
        bChanged = true;
      }
    }

    return bChanged;
  }

  private normalizeInGameStats(cuki: CukiDocument): boolean {
    let bChanged = false;
    const cukiAny = cuki as any;

    if (!cukiAny.inGameStats || typeof cukiAny.inGameStats !== 'object') {
      cukiAny.inGameStats = {};
      bChanged = true;
    }

    if (
      !cukiAny.inGameStats.xp ||
      typeof cukiAny.inGameStats.xp !== 'object'
    ) {
      cukiAny.inGameStats.xp = {};
      bChanged = true;
    }

    for (const skill of this.skillKeys) {
      const xp = cukiAny.inGameStats.xp[skill];
      if (!Array.isArray(xp) || xp.length !== 2) {
        cukiAny.inGameStats.xp[skill] = [0, 0];
        bChanged = true;
        continue;
      }

      const total = this.toNonNegativeNumber(xp[0], 0);
      const spent = this.toNonNegativeNumber(xp[1], 0);
      if (xp[0] !== total || xp[1] !== spent) {
        cukiAny.inGameStats.xp[skill] = [total, spent];
        bChanged = true;
      }
    }

    const bShouldRestoreFullStats = this.shouldRestoreFullStats(cuki);
    let bRestoredFullStats = false;
    for (const stat of ['life', 'energy']) {
      const maxStat = this.toNonNegativeNumber(cukiAny.skills?.[stat], 0);
      const currentRaw = cukiAny.inGameStats[stat];
      const currentNumber = Number(currentRaw);
      const bHasCurrentStat = Number.isFinite(currentNumber);
      let nextStat = bHasCurrentStat
        ? Math.min(Math.max(0, currentNumber), maxStat)
        : maxStat;

      if (bShouldRestoreFullStats && nextStat < maxStat) {
        nextStat = maxStat;
        bRestoredFullStats = true;
      }

      if (!bHasCurrentStat || currentRaw !== nextStat) {
        cukiAny.inGameStats[stat] = nextStat;
        bChanged = true;
      }
    }

    if (bRestoredFullStats) {
      const now = Date.now();
      this.updateLastChangeTimestamp(cuki, 'last-activity', now);
      this.updateLastChangeTimestamp(cuki, this.fullRecoveryCategory, now);
      bChanged = true;
    }

    return bChanged;
  }

  /**
   * Method to find all Cukis
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.cukiCRUD.getAll(findParams);
  }

  /**
   * Method to find specific Cuki by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.cukiCRUD.getOne({ filterQuery: { _id: id } });
  }

  /**
   * Method to create a bew Cuki
   * @param createCukiDto : New object
   * @returns
   */
  async create(params: { createCukiDto: CreateCukiDto }): Promise<Output> {
    const { createCukiDto } = params;
    return await this.cukiCRUD.create(createCukiDto);
  }

  /**
   * Method to update some Cuki data.
   * @param id : Cuki id that we want to change.
   * @param updateCukiDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateCukiDto: UpdateCukiDto;
    userId?: string;
  }): Promise<Output> {
    const { id, updateCukiDto, userId } = params;

    if (userId) {
      await this.checkCukiOwner({ userId, cukiId: id });
      await this.updateLastChange({ userId, cukiId: id, lastChange: 'cuki' });
    }
    return await this.cukiCRUD.update(id, updateCukiDto, true);
  }

  /**
   * Method to remove some Cuki object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return this.cukiCRUD.remove(id, true);
  }

  /**
   * Method to update the last change that the user has made in the game.
   * @param userId : Id of the user that has the cuki.
   * @param cukiId : Id of the cuki that we want to update.
   * @param lastChange : Last change that the user has made.
   * @returns
   */
  async updateLastChange(params: {
    userId: string;
    cukiId: string;
    lastChange: string;
  }) {
    const { userId, cukiId, lastChange } = params;

    await this.checkCukiOwner({ userId, cukiId });

    const data: CukiDocument = await this.cukiModel.findById(cukiId);

    if (!data) throw new HttpException('Cuki not found', HttpStatus.NOT_FOUND);

    if (!Array.isArray(data.lastChanges)) {
      data.lastChanges = [];
    }

    this.normalizeInGameStats(data);

    // Insert or replace the last change in lastChanges array
    const index = data.lastChanges.findIndex(
      (change) => change.category === lastChange
    );
    if (index !== -1) {
      data.lastChanges[index].timestamp = new Date().getTime();
    } else {
      data.lastChanges.push({
        category: lastChange,
        timestamp: new Date().getTime(),
      });
    }

    (data as any).markModified?.('inGameStats');
    (data as any).markModified?.('lastChanges');
    await data.save();

    return data;
  }

  /**
   * Method to find all cukies from User
   * @returns
   */
  async getCukies(params: { userId: string }): Promise<Output> {
    const { userId } = params;

    const data = await this.userModel.findById(userId).populate('wallets');
    if (!data) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const wallets = [];
    let cukies: CukiDocument[] = [];

    if (data.wallets.length >= 1) {
      for (const wallet of data.wallets as any) {
        wallets.push(wallet.address);
      }

      cukies = await this.cukiModel
        .find({ user: { $in: wallets } })
        .skip(0)
        .limit(1000)
        .sort('ASC');
    }

    for (const cuki of cukies) {
      const newCuki = await this.checkInGameStats({ cukiId: cuki._id });
      if (JSON.stringify(newCuki) !== JSON.stringify(cuki)) {
        cukies[cukies.indexOf(cuki)] = newCuki;
      }
      // start check initial missions
      const cukiMissions = await this.cukiMissionModel.find({
        cukiId: cuki._id,
      });
      if (cukiMissions.length === 0) {
        const missions = await this.missionModel.find({
          tier: 0,
          requirements: [],
        });
        for (const mission of missions) {
          const newCukiMission = new this.cukiMissionModel({
            cukiId: cuki._id,
            MissionId: mission.MissionId,
            progress: new Array(mission.actions.length).fill(0),
            state: new Array(mission.actions.length).fill(false),
          });
          await newCukiMission.save();
        }
      }
      //End check initial missions
    }

    const result: IResponseCRUD = {
      totalCount: cukies.length,
      results: cukies,
    };

    return result;
  }

  /**
   * Method to get the cukies inGameStats
   * @returns Output
   * @param userId
   * @param cukiId
   */
  async getInGameStats(params: {
    userId: string;
    cukiId: string;
  }): Promise<Output> {
    const { userId, cukiId } = params;

    await this.checkCukiOwner({ userId, cukiId });

    const cuki = await this.cukiCRUD.getOne({
      filterQuery: { _id: cukiId },
    });

    return cuki;
  }

  /**
   * Method to check if the cuki has the inGameStats property
   * @returns Cuki
   * @param cukiId
   */
  async checkInGameStats(params: { cukiId: string }): Promise<CukiDocument> {
    const { cukiId } = params;

    if (!cukiId) {
      throw new Error('Invalid cukiId');
    }
    const cuki = await this.cukiModel.findById(cukiId);
    if (!cuki) throw new HttpException('Cuki not found', HttpStatus.NOT_FOUND);

    if (this.normalizeInGameStats(cuki)) {
      (cuki as any).markModified?.('inGameStats');
      (cuki as any).markModified?.('lastChanges');
      await cuki.save();
    }
    return cuki;
  }

  /**
   * Method to update the inGameStats property
   * @returns Cuki
   * @param cukiId
   * @param inGameStats
   * @param requestId
   * @param userId
   */
  async updateInGameStats(params: {
    cukiId: string;
    inGameStatsDto: InGameStatsDto;
    userId: string;
  }): Promise<Output> {
    const { cukiId, inGameStatsDto, userId } = params;

    await this.checkCukiOwner({ userId, cukiId });

    const cuki = await this.cukiModel.findById(cukiId);
    if (!cuki) throw new HttpException('Cuki not found', HttpStatus.NOT_FOUND);

    const bAppliedUpdate = this.applyInGameStatsUpdate(cuki, inGameStatsDto);
    const bNormalized = this.normalizeInGameStats(cuki);
    if (bAppliedUpdate || bNormalized) {
      (cuki as any).markModified?.('inGameStats');
      (cuki as any).markModified?.('lastChanges');
      await cuki.save();
    }

    const result: Output = {
      totalCount: 1,
      results: [cuki],
    };
    return result;
  }

  /**
   * Method to check if the user is the owner of the cuki
   * @returns boolean
   * @param userId
   * @param cukiId
   */
  async checkCukiOwner(params: {
    userId: string;
    cukiId: string;
  }): Promise<boolean> {
    const { userId, cukiId } = params;

    const userData = await this.userModel.findById(userId).populate('wallets');
    const cukiData = await this.cukiModel.findById(cukiId);

    if (!userData || !cukiData)
      throw new HttpException('User or cuki not found', HttpStatus.NOT_FOUND);

    // Check if the user property in cuki is in "wallets" array in userData
    const wallets = Array.isArray(userData.wallets) ? userData.wallets : [];
    if (
      !wallets.some((wallet) => {
        const address = `${wallet?.['address'] ?? ''}`.toLowerCase();
        return address === cukiData.user.toLowerCase();
      })
    )
      throw new HttpException(
        'Your are not the owner of this cuki',
        HttpStatus.FORBIDDEN
      );

    return true;
  }

  /**
   * Method to get the updateQuery
   * @returns
   * @param obj
   * @param parent
   */
  buildUpdateQuery(obj, parent = 'myObject') {
    const update = {};
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const nestedUpdate = this.buildUpdateQuery(
          obj[key],
          `${parent}.${key}`
        );
        Object.assign(update, nestedUpdate);
      } else {
        update[`${parent}.${key}`] = obj[key];
      }
    }
    return update;
  }

  /**
   * Method to update the last cuki activity
   * @returns
   * @param userId
   * @param cukiId
   * @param requestId
   */
  async updateLastActivity(params: {
    cukiId: string;
    userId: string;
  }): Promise<Output> {
    const { cukiId, userId } = params;

    const cuki = await this.updateLastChange({
      userId,
      cukiId,
      lastChange: 'last-activity',
    });

    const result: Output = {
      totalCount: 1,
      results: [cuki],
    };

    return result;
  }

  /**
   * Method to update the last cuki bedrest
   * @returns
   * @param userId
   * @param cukiId
   * @param requestId
   */
  async updateBedrest(params: {
    cukiId: string;
    userId: string;
  }): Promise<Output> {
    const { cukiId, userId } = params;

    const cuki = await this.updateLastChange({
      userId,
      cukiId,
      lastChange: 'last-bedrest',
    });

    const result: Output = {
      totalCount: 1,
      results: [cuki],
    };

    return result;
  }

  /**
   * Method to level up a skill
   * @returns Cuki
   * @param levelUpDto
   */
  async levelUpCuki(params: {
    cukiId: string;
    userId: string;
    levelUpDto: LevelUpDto;
  }): Promise<CukiDocument | IResponse> {
    const { cukiId, userId, levelUpDto } = params;
    if (!cukiId || !userId || !levelUpDto) {
      return {
        message: 'Invalid parameters',
        code: 400,
      };
    }
    if (!levelUpDto.skill || !levelUpDto.cost) {
      return {
        message: 'Invalid parameters',
        code: 400,
      };
    }
    await this.checkCukiOwner({ userId, cukiId });

    const cuki = await this.checkInGameStats({ cukiId });
    const skill = this.normalizeSkill(levelUpDto.skill);
    const cost = this.assertPositiveNumber(levelUpDto.cost, 'cost');
    const xp = (cuki.inGameStats.xp as any)[skill];
    if (!Array.isArray(xp) || xp.length < 2) {
      throw new HttpException(
        'Invalid cuki xp data',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    // Check if the user has enough experience to level up the skill
    if (xp[0] - xp[1] < cost) {
      return {
        message: `Not enough experience to level up ${skill}`,
        code: 400,
      };
    }

    xp[1] += cost;

    (cuki.skills as any)[skill] += 1;
    await cuki.save();
    return cuki;
  }

  /**
   * Method to level up a skill
   * @returns Cuki
   * @param expDto
   */
  async addExpToCuki(params: {
    cukiId: string;
    userId: string;
    expDto: AddExpDto;
  }): Promise<CukiDocument | IResponse> {
    if (!params.cukiId || !params.userId || !params.expDto) {
      return {
        message: 'Invalid parameters',
        code: 400,
      };
    }

    await this.checkCukiOwner({
      cukiId: params.cukiId,
      userId: params.userId,
    });

    return this.addExpDeltasToCuki({
      cukiId: params.cukiId,
      userId: params.userId,
      expDtos: [params.expDto],
    });
  }

  async addExpDeltasToCuki(params: {
    cukiId: string;
    userId: string;
    expDtos: AddExpDto[];
  }): Promise<CukiDocument | IResponse> {
    const { cukiId, userId, expDtos } = params;
    if (
      !cukiId ||
      !userId ||
      !Array.isArray(expDtos) ||
      expDtos.length === 0 ||
      expDtos.some((expDto) => !expDto)
    ) {
      return {
        message: 'Invalid parameters',
        code: 400,
      };
    }
    // Do not check if the user is the owner of the cuki because the user can level up a cuki from another user if schoolaship

    const cuki = await this.checkInGameStats({ cukiId });
    const normalizedDeltas = expDtos.map((expDto) => ({
      skill: this.normalizeSkill(expDto.skill),
      exp: this.assertPositiveNumber(expDto.exp, 'exp'),
    }));

    for (const delta of normalizedDeltas) {
      const xp = (cuki.inGameStats.xp as any)[delta.skill];
      if (!Array.isArray(xp) || xp.length < 2) {
        throw new HttpException(
          'Invalid cuki xp data',
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
    }

    for (const delta of normalizedDeltas) {
      const xp = (cuki.inGameStats.xp as any)[delta.skill];
      xp[0] += delta.exp;
    }
    await cuki.save();

    return cuki;
  }

  async updateCwTutorial(params: {
    cukiId: string;
    userId: string;
    cwTutorial: number;
  }) {
    const { cukiId, userId, cwTutorial } = params;
    const isOwner = await this.checkCukiOwner({ userId, cukiId });
    if (!isOwner) {
      return { code: 403, message: 'You are not the owner of this cuki' };
    }
    const data = await this.cukiModel.findById(cukiId);
    if (!data) {
      throw new HttpException('Cuki not found', HttpStatus.NOT_FOUND);
    }
    data.cwTutorial = cwTutorial;
    try {
      data.save();
      return { code: 200, message: 'Tutorial step updated' };
    } catch (e) {
      console.log(e);
      return { code: 400, message: 'Error updating tutorial step' };
    }
  }

  async setSkinVariables(params: {
    cukiId: string;
    userId: string;
    skinVariables: [number, number, number];
  }) {
    const { cukiId, userId, skinVariables } = params;
    const isOwner = await this.checkCukiOwner({ userId, cukiId });
    if (!isOwner) {
      return { code: 403, message: 'You are not the owner of this cuki' };
    }
    const data = await this.cukiModel.findById(cukiId);
    if (!data) {
      throw new HttpException('Cuki not found', HttpStatus.NOT_FOUND);
    }
    data.skinVariables = skinVariables;
    try {
      data.save();
      return { code: 200, message: 'Skin variables updated' };
    } catch (e) {
      console.log(e);
      return { code: 400, message: 'Error updating skin variables' };
    }
  }
}
