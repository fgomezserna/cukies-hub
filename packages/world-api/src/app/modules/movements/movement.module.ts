import { Movement, MovementSchema } from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovementController } from './movement.controler';
import { MovementService } from './movement.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: Movement.name, schema: MovementSchema }],
      'gameDB'
    ),
  ],
  controllers: [MovementController],
  providers: [MovementService],
})
export class MovementModule {}
