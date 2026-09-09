import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CukiMissionDocument = CukiMission & Document;

@Schema({
  collation: { locale: 'en', strength: 2 },
  timestamps: true,
})
export class CukiMission {
  @Prop({ type: String, required: true })
  cukiId!: string;

  @Prop({ type: String, required: true })
  MissionId: string;

  @Prop({ type: [Number], default: [0] }) // Array de números, por defecto con un elemento '0'
  progress: number[];

  @Prop({ type: [Boolean], default: [false] }) // Array de booleanos, por defecto con un elemento 'false'
  state: boolean[];

  @Prop({ type: Boolean, default: false })
  claimed: boolean;
}

export const CukiMissionSchema = SchemaFactory.createForClass(CukiMission);
