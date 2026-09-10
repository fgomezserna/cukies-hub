import * as mongoose from 'mongoose';

import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ResourceMapDocument = ResourceMap & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class ResourceMap {
  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Map', required: true })
  map!: string;

  @Prop({
    type: {
      Resources: {
        type: {
          mapSize: { type: Number, required: true },
          mapResources: [{ type: Array, required: true }],
        },
      },
      Buildings: {
        type: {
          mapSize: { type: Number, required: true },
          mapBuildings: [{ type: Array, required: true }],
        },
      },
    },
    required: true,
  })
  data!: {
    Resources: {
      mapSize: number;
      mapResources: number[][];
    };
    Buildings: {
      mapSize: number;
      mapBuildings: number[][];
    };
  };
}

export const ResourceMapSchema = SchemaFactory.createForClass(ResourceMap);
