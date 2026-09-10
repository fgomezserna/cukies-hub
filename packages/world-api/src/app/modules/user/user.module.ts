import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Cukie,
  CukieSchema,
  ResourceMap,
  ResourceMapSchema,
  User,
  UserMap,
  UserMapSchema,
  UserSchema,
} from '@cukies/world-shared';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Cukie.name, schema: CukieSchema },
        { name: User.name, schema: UserSchema },
      ],
      'cukiesDB'
    ),
    MongooseModule.forFeature(
      [
        { name: ResourceMap.name, schema: ResourceMapSchema },
        { name: UserMap.name, schema: UserMapSchema },
      ],
      'gameDB'
    ),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
