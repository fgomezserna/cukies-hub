import { PartialType } from '@nestjs/swagger';
import { CreateMissionStepDto } from './create-missionStep.dto';

export class UpdateMissionStepDto extends PartialType(CreateMissionStepDto) {}
