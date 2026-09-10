import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { CukiMissionService } from './cuki-mission.service';
import { UpdateCukiMissionProgressDto } from './dto/UpdateCukiMissionProgressDto.dto';
import { completeCheckmarkDto } from './dto/completeCheckmarkDto.dto';
import { CompleteMissionDto } from './dto/completeMissionDto.dto';
import { createCukiMissionsDto } from './dto/create-cuki-missions.dto';

@Controller('cuki-mission')
export class CukiMissionController {
  constructor(private readonly cukiMissionService: CukiMissionService) {}
  @Swagger({
    tag: 'CukiMission',
    description: 'Create cukiMission.',
    response: 'CukiMissions',
  })
  // create cukiMission
  @UseGuards(AuthenticationGuard)
  @Post()
  async createCukiMission(
    @Body() createCukiMissionDto: createCukiMissionsDto,
    @Query('userId') userId: string
  ) {
    const { missionsId, cukiId } = createCukiMissionDto;
    return this.cukiMissionService.createCukiMission({
      userId,
      missionsId,
      cukiId,
    });
  }
  // update cukiMission
  //complete cukiMission ???

  @UseGuards(AuthenticationGuard)
  @Get('get-missions/:cukiId')
  async getMissions(
    @Param('cukiId') cukiId: string,
    @Query('userId') userId: string
  ) {
    return this.cukiMissionService.getMissions({ userId, cukiId });
  }
  @UseGuards(AuthenticationGuard)
  @Post('make-progress')
  async updateCukiMissionProgress(
    @Body()
    updateCukiMissionProgressDto: UpdateCukiMissionProgressDto,
    @Query('userId') userId: string
  ) {
    const { cukiId, missionId, progress, actions } =
      updateCukiMissionProgressDto;
    return this.cukiMissionService.updateCukiMission({
      userId,
      cukiId,
      missionId,
      actions,
      progress,
    });
  }
  @UseGuards(AuthenticationGuard)
  @Post('complete-checkmark')
  async completeCheckmark(
    @Body()
    completeCheckmarkDto: completeCheckmarkDto,
    @Query('userId') userId: string
  ) {
    const { cukiId, missionId, state, actions } = completeCheckmarkDto;
    return this.cukiMissionService.updateCukiMission({
      userId,
      cukiId,
      missionId,
      actions,
      state,
    });
  }

  @UseGuards(AuthenticationGuard)
  @Post('complete-mission')
  async completeMission(
    @Body()
    completeMissionDto: CompleteMissionDto,
    @Query('userId') userId: string
  ) {
    const { cukiId, missionId, skills, exp, items } = completeMissionDto;
    return this.cukiMissionService.completeMission({
      userId,
      cukiId,
      missionId,
      skills,
      exp,
      items,
    });
  }
}
