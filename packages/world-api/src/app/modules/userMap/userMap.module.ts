import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ResourceMap,
  ResourceMapSchema,
  User,
  UserMap,
  UserMapSchema,
  UserSchema,
} from '@cukies/world-shared';
import { UserMapDtoController } from './userMap.controller';
import { UserMapService } from './userMap.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: UserMap.name,
          schema: UserMapSchema,
        },
        { name: ResourceMap.name, schema: ResourceMapSchema },
      ],
      'gameDB'
    ),
    MongooseModule.forFeature(
      [{ name: User.name, schema: UserSchema }],
      'cukiesDB'
    ),
  ],
  controllers: [UserMapDtoController],
  providers: [UserMapService],
})
export class UserMapModule {}
