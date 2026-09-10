import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MissionStep,
  MissionStepSchema,
} from '@cukies/world-shared';
import { MissionStepController } from './missionStep.controller';
import { MissionStepService } from './missionStep.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: MissionStep.name,
          schema: MissionStepSchema,
        },
      ],
      'gameDB'
    ),
  ],
  controllers: [MissionStepController],
  providers: [MissionStepService],
})
export class MissionStepModule {}
