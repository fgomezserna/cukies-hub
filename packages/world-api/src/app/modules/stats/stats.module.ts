import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Stats, StatsSchema } from '@cukies/world-shared';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: Stats.name, schema: StatsSchema }],
      'gameDB'
    ),
  ],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
