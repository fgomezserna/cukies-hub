import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Mission, MissionSchema } from '@cukies/world-shared';
import { MissionController } from './mission.controller';
import { MissionService } from './mission.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: Mission.name, schema: MissionSchema }],
      'gameDB'
    ),
  ],
  controllers: [MissionController],
  providers: [MissionService],
})
export class MissionModule {}
