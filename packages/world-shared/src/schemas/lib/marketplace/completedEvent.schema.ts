import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
export type CompletedEventDocument = CompletedEvent & Document;

@Schema({ collection: 'completedEvents', timestamps: true })
export class CompletedEvent {
  @Prop({ type: String })
  eventId!: string;

  @Prop({ type: Number })
  timeStamp!: number;
}

export const CompletedEventSchema =
  SchemaFactory.createForClass(CompletedEvent);
