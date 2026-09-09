import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Map, MapSchema } from '@cukies/world-shared';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: Map.name, schema: MapSchema }],
      'gameDB'
    ),
  ],
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
