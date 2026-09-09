import * as mongoose from 'mongoose';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserMapDocument = UserMap & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class UserMap {
  @Prop({
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  })
  islandId?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'resourceMap',
    required: true,
  })
  resourceMap!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Map', required: true })
  baseMap!: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  user!: string;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
    required: false,
  })
  data?: {
    Resources?: {
      mapSize: number;
      mapResources: unknown[][];
    };
    Buildings?: {
      mapSize: number;
      mapBuildings: unknown[][];
    };
    HouseAppliances?: any[];
  };

  @Prop({
    type: {
      Resources: { type: mongoose.Schema.Types.Mixed, default: {} },
      Buildings: { type: mongoose.Schema.Types.Mixed, default: {} },
      HouseAppliances: { type: Array, default: [] },
    },
    default: () => ({
      Resources: {},
      Buildings: {},
      HouseAppliances: [],
    }),
  })
  overrides!: {
    Resources?: Record<string, unknown>;
    Buildings?: Record<string, unknown>;
    HouseAppliances?: any[];
  };

  @Prop({
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  })
  islandActionEvents?: Record<string, unknown>[];

  @Prop({
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  })
  islandChatMessages?: Record<string, unknown>[];

  @Prop({
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  })
  islandChatReports?: Record<string, unknown>[];

  @Prop({
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  })
  islandChatBlocks?: Record<string, unknown>[];

  @Prop({
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  })
  islandEconomyMutations?: Record<string, unknown>[];
}

export const UserMapSchema = SchemaFactory.createForClass(UserMap);
