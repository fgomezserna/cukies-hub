import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ResourceMap,
  ResourceMapSchema,
  Map,
  MapSchema,
} from '@cukies/world-shared';
import { ResourceMapDtoController } from './resourceMap.controller';
import { ResourceMapService } from './resourceMap.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: ResourceMap.name,
          schema: ResourceMapSchema,
        },
      ],
      'gameDB'
    ),
    MongooseModule.forFeature(
      [
        {
          name: Map.name,
          schema: MapSchema,
        },
      ],
      'gameDB'
    ),
  ],
  controllers: [ResourceMapDtoController],
  providers: [ResourceMapService],
})
export class ResourceMapModule {}
