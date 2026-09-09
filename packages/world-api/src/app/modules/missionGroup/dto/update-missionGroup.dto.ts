import { PartialType } from '@nestjs/swagger';
import { CreateMissionGroupDto } from './create-missionGroup.dto';

export class UpdateMissionGroupDto extends PartialType(CreateMissionGroupDto) {}
