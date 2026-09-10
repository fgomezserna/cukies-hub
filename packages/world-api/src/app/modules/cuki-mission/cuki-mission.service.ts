import {
  CukiMission,
  CukiMissionDocument,
  Mission,
  MissionDocument,
} from '@cukies/world-shared';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CukiService } from '../cuki/cuki.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class CukiMissionService {
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
    @InjectModel(CukiMission.name, 'gameDB')
    private cukiMissionModel: Model<CukiMissionDocument>,
    @InjectModel(Mission.name, 'gameDB')
    private missionModel: Model<MissionDocument>,
    private inventoryService: InventoryService,
    private cukiService: CukiService
  ) {}

  private normalizeSkill(skill: string): string {
    const normalizedSkill = skill === 'cook' ? 'scout' : skill;
    if (!this.skillKeys.includes(normalizedSkill)) {
      throw new HttpException('Invalid skill', HttpStatus.BAD_REQUEST);
    }

    return normalizedSkill;
  }

  private assertPositiveNumber(value: unknown, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new HttpException(`${fieldName} must be positive`, HttpStatus.BAD_REQUEST);
    }

    return parsed;
  }

  async getMissions(params: { userId: string; cukiId: string }) {
    const { userId, cukiId } = params;
    await this.cukiService.checkCukiOwner({ userId, cukiId });
    const cukiMissions = await this.cukiMissionModel
      .find({ cukiId: cukiId })
      .select('-_id -__v -createdAt -updatedAt');
    if (!cukiMissions) {
      return { message: `No missions found for cuki ${cukiId}`, code: 404 };
    }
    return cukiMissions;
  }
  // Add your service methods here
  async createCukiMission(createCukiMissionDto: {
    userId: string;
    missionsId: string[];
    cukiId: string;
  }) {
    // find the missions in missionModel by missionID, check if already exists a cukimission with that missionID and cukiID, if not, create it with some conditions ill add manually
    const { userId, missionsId, cukiId } = createCukiMissionDto;
    await this.cukiService.checkCukiOwner({ userId, cukiId });
    if (!Array.isArray(missionsId) || missionsId.length === 0) {
      throw new HttpException('missionsId must not be empty', HttpStatus.BAD_REQUEST);
    }

    const response = [];
    for (const missionId of missionsId) {
      const mission = await this.missionModel.findOne({ MissionId: missionId });
      if (!mission) {
        response.push({
          message: `Mission ${missionId} not found in DB, Check if id is correct or if the mission exists in the DB`,
        });
        continue;
      }
      const cukiMission = await this.cukiMissionModel.findOne({
        cukiId: cukiId,
        MissionId: missionId,
      });
      if (cukiMission) {
        response.push({
          message: `CukiMission ${missionId} already exists`,
        });
        continue;
      } else {
        const newCukiMission = new this.cukiMissionModel({
          cukiId: cukiId,
          MissionId: missionId,
          progress: new Array(mission.actions?.length ?? 0).fill(0),
          state: new Array(mission.actions?.length ?? 0).fill(false),
        });
        await newCukiMission.save();
        response.push({
          message: `CukiMission ${missionId} created`,
        });
      }
    }
    return response;
  }

  async updateCukiMission(updateCukiMissionDto: {
    userId: string;
    cukiId: string;
    missionId: string;
    actions: string[];
    progress?: number[];
    state?: boolean[];
  }) {
    const { userId, cukiId, missionId, actions } = updateCukiMissionDto;
    await this.cukiService.checkCukiOwner({ userId, cukiId });
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new HttpException('actions must not be empty', HttpStatus.BAD_REQUEST);
    }

    const mission = await this.missionModel.findOne({ MissionId: missionId });
    if (!mission) {
      return {
        message: `Mission ${missionId} not found`,
        code: 404,
      };
    }

    let result = await this.cukiMissionModel.findOne({
      cukiId: cukiId,
      MissionId: missionId,
    });
    if (!result) {
      return {
        message: `CukiMission ${missionId} not found`,
        code: 404,
      };
    }
    if (updateCukiMissionDto.progress) {
      if (updateCukiMissionDto.progress.length !== actions.length) {
        throw new HttpException(
          'progress length must match actions length',
          HttpStatus.BAD_REQUEST
        );
      }
      //check the index of actions[i] in the mission actions array, then update the progress[i] int the cukimission and update the entry
      const missionActions = mission.actions ?? [];
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const index = missionActions.indexOf(action);
        if (index !== -1) {
          result.progress[index] = updateCukiMissionDto.progress[i];
        }
      }
      result.markModified('progress');
      // atualizar progress de acuerdo a los indexes con el valor de progress
    }
    if (updateCukiMissionDto.state) {
      if (updateCukiMissionDto.state.length !== actions.length) {
        throw new HttpException(
          'state length must match actions length',
          HttpStatus.BAD_REQUEST
        );
      }
      const missionActions = mission.actions ?? [];
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const index = missionActions.indexOf(action);
        if (index !== -1) {
          result.state[index] = updateCukiMissionDto.state[i];
        }
      }
      result.markModified('state');
    }
    result = await result.save();
    return result;
  }
  async completeMission(completeMissionDto: {
    userId: string;
    cukiId: string;
    missionId: string;
    skills: string[];
    exp: number[];
    items: {
      itemId: string;
      quantity: number;
      slot: number;
    }[];
  }): Promise<any> {
    const { cukiId, missionId, userId, skills, exp, items } =
      completeMissionDto;
    await this.cukiService.checkCukiOwner({ userId, cukiId });
    if (!Array.isArray(skills) || !Array.isArray(exp) || skills.length !== exp.length) {
      throw new HttpException(
        'skills length must match exp length',
        HttpStatus.BAD_REQUEST
      );
    }
    const normalizedRewards = skills.map((skill, index) => ({
      skill: this.normalizeSkill(skill),
      exp: this.assertPositiveNumber(exp[index], 'exp'),
    }));
    const rewardItems = Array.isArray(items) ? items : [];

    const mission = await this.missionModel.findOne({ MissionId: missionId });
    if (!mission) {
      return {
        message: `Mission ${missionId} not found`,
        code: 404,
      };
    }
    const result = await this.cukiMissionModel.findOne({
      cukiId: cukiId,
      MissionId: missionId,
    });

    if (!result) {
      return {
        message: `CukiMission ${missionId} not found`,
        code: 404,
      };
    }
    if (result.claimed) {
      return {
        message: `CukiMission  already claimed`,
        code: 409,
      };
    }
    result.state = new Array(mission.actions?.length ?? 0).fill(true);

    try {
      const itemContentDto = rewardItems.map((item) => ({
        id: item.itemId,
        amount: item.quantity,
        slot: item.slot,
      }));
      if (itemContentDto.length > 0) {
        await this.inventoryService.addItemsToInventory({
          userId,
          itemContentDto,
          cukiId,
        });
      }
    } catch (e) {
      return {
        message: `Error adding items to inventory`,
        code: 500,
      };
    }
    try {
      for (const reward of normalizedRewards) {
        await this.cukiService.addExpToCuki({
          cukiId,
          userId,
          expDto: {
            skill: reward.skill,
            exp: reward.exp,
          },
        });
      }
    } catch (e) {
      return {
        message: `Error adding exp to cuki, items added to inventory`,
        code: 500,
      };
    }
    await this.cukiMissionModel.findOneAndUpdate(
      { cukiId: cukiId, MissionId: missionId },
      { state: result.state, claimed: true }
    );
    return {
      message: `Mission ${missionId} completed successfully`,
      code: 200,
    };
  }
}
