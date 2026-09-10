import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
// import { Wallet } from '@cukies/world-shared';

export class CreateUserDto {
  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  name?: string;

  @ApiProperty({
    description: 'User email',
    example: '',
  })
  lastName?: string;

  @IsString()
  @MinLength(4, {
    message: 'username has to be longer than four characters',
  })
  @IsNotEmpty({
    message: 'this field must not be empty',
  })
  @ApiProperty({
    description: 'User username',
    example: 'johndoe',
    required: true,
  })
  username: string;

  @ApiProperty({
    description: 'User email',
    example: '',
  })
  email?: string;

  phone?: string;

  wallets?: string[];

  @IsString()
  @Matches(
    /^(?=(?:.*\d){1})(?=(?:.*[A-Z]){1})(?=(?:.*[a-z]){1})(?=(?:.*[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]){1})\S{8,16}$/,
    {
      message: 'password is not valid',
    }
  )
  @ApiProperty({
    description: 'User password',
    example: 'Test123!',
    required: true,
  })
  password: string;

  role?: string;

  @ApiProperty({
    description: 'User token balance',
    example: 5000,
  })
  tokenBalance?: number;

  @ApiProperty({
    description: 'Object that contains the type and timestamp of last change',
  })
  lastChanges?: {
    category: string;
    timeStamp: number;
  }[];
}
