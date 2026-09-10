import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type MissionStepDocument = MissionStep & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class MissionStep {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String })
  description!: string | null;

  @Prop({ type: Boolean, default: false, required: true })
  done!: boolean;

  @Prop({
    type: {
      missions: [
        {
          type: String,
          default: [],
          ref: 'Mission',
        },
      ],
      items: [
        {
          type: {
            item: {
              type: String,
              default: [],
              ref: 'Item',
            },
            amount: {
              type: Number,
              default: 0,
            },
          },
          default: [],
        },
      ],
      skills: {
        type: {
          miner: [{ type: Number, default: [] }],
          engineer: [{ type: Number, default: [] }],
          farmer: [{ type: Number, default: [] }],
          gatherer: [{ type: Number, default: [] }],
          scout: [{ type: Number, default: [] }],
          breeder: [{ type: Number, default: [] }],
          life: [{ type: Number, default: [] }],
          energy: [{ type: Number, default: [] }],
          generation: [{ type: Number, default: [] }],
          _id: { type: Number, default: 0 },
        },
        default: {},
      },
    },
  })
  requirements!: {
    missions?: string[];
    items: {
      item?: string;
      amount?: number;
    }[];
    skills: {
      miner?: number[];
      engineer?: number[];
      farmer?: number[];
      gatherer?: number[];
      scout?: number[];
      breeder?: number[];
      life?: number[];
      energy?: number[];
      generation?: number[];
    };
  };
}

export const MissionStepSchema = SchemaFactory.createForClass(MissionStep);
