import { Building, BuildingSchema } from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuildingController } from './building.controller';
import { BuildingService } from './building.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: Building.name,
          schema: BuildingSchema,
        },
      ],
      'gameDB'
    ),
  ],
  controllers: [BuildingController],
  providers: [BuildingService],
})
export class BuildingModule {}
