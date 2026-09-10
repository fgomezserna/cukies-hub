import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MissionGroup,
  MissionGroupSchema,
} from '@cukies/world-shared';
import { MissionGroupService } from './missionGroup.service';
import { MissionGroupController } from './missionGroup.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: MissionGroup.name,
          schema: MissionGroupSchema,
        },
      ],
      'gameDB'
    ),
  ],
  controllers: [MissionGroupController],
  providers: [MissionGroupService],
})
export class MissionGroupModule {}
