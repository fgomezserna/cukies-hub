import {
  Cukie as Cuki,
  CukiMission,
  CukiMissionSchema,
  CukieSchema as CukiSchema,
  Mission,
  MissionSchema,
  User,
  UserSchema,
  Wallet,
  WalletSchema,
} from '@cukies/world-shared';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CukiController } from './cuki.controller';
import { CukiService } from './cuki.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Cuki.name, schema: CukiSchema },
        { name: User.name, schema: UserSchema },
        { name: Wallet.name, schema: WalletSchema },
      ],
      'cukiesDB'
    ),
    MongooseModule.forFeature(
      [
        { name: CukiMission.name, schema: CukiMissionSchema },
        { name: Mission.name, schema: MissionSchema },
      ],
      'gameDB'
    ),
  ],
  controllers: [CukiController],
  providers: [CukiService],
  exports: [CukiService],
})
export class CukiModule {}
