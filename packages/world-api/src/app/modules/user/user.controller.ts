import { Output } from '@cukies/world-shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.authentication.guard';
import { AuthenticationGuard } from '../../auth/authentication.guard';
import { Swagger } from '../../decorators/swagger.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get all users with params.',
    response: CreateUserDto,
  })
  @UseGuards(AdminGuard)
  @Get()
  async findAll(
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @Query('filterQuery') filterQuery: string,
    @Query('order') order: string
  ): Promise<Output> {
    const params = {
      skip: parseInt(skip),
      limit: parseInt(limit),
      filterQuery: JSON.parse(filterQuery),
      order,
    };
    return this.userService.findAll({ findParams: params });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Get one user.',
    response: CreateUserDto,
  })
  @UseGuards(AdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Output> {
    return this.userService.findOne({ id });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Create one user.',
    response: CreateUserDto,
  })
  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<Output> {
    return this.userService.create({ createUserDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Update one user.',
    response: CreateUserDto,
  })
  @UseGuards(AdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<Output> {
    return this.userService.update({ id, updateUserDto });
  }

  @Swagger({
    tag: 'Admin CRUD',
    description: 'Remove one user.',
    response: CreateUserDto,
  })
  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Output> {
    return this.userService.remove({ id });
  }

  @Swagger({
    tag: 'User',
    description: 'Update one user. (Only with token authentication)',
    response: UpdateUserDto,
  })
  @UseGuards(AuthenticationGuard)
  @Patch('fromToken')
  async updateFromToken(
    @Body() updateUserDto: UpdateUserDto,
    @Query('userId') userId: string
  ): Promise<Output> {
    return this.userService.update({
      id: updateUserDto._id,
      updateUserDto,
      userId,
    });
  }

  @Swagger({
    tag: 'User',
    description: 'Get one user. (Only with token authentication)',
    response: CreateUserDto,
  })
  @UseGuards(AuthenticationGuard)
  @Get('fromToken')
  async getUserFromToken(@Query('userId') userId: string): Promise<Output> {
    return this.userService.getUserFromToken({ userId });
  }
}
