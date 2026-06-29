import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user profiles (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'List of user profiles successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications for current user (Requires Auth)' })
  @ApiResponse({ status: 200, description: 'Notifications successfully retrieved.' })
  getNotifications(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.getNotifications(userId);
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read (Requires Auth)' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read.' })
  readAllNotifications(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.readAllNotifications(userId);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark a notification as read (Requires Auth)' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  readNotification(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.usersService.readNotification(id, userId);
  }

  @Delete('notifications/:id')
  @ApiOperation({ summary: 'Delete a specific notification (Requires Auth)' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully.' })
  deleteNotification(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.usersService.deleteNotification(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user profile by ID (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully.',
  })
  @ApiResponse({ status: 404, description: 'User profile not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user profile (Requires Auth)' })
  @ApiResponse({
    status: 201,
    description: 'User profile created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or profile already exists.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@Body() createUserProfileDto: CreateUserProfileDto) {
    return this.usersService.create(createUserProfileDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing user profile (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid data or update failed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ) {
    return this.usersService.update(id, updateUserProfileDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user profile by ID (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'User profile deleted successfully.',
  })
  @ApiResponse({ status: 400, description: 'Delete failed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    if (req.user && req.user.id === id) {
      throw new HttpException(
        'You cannot delete your own account',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.usersService.remove(id, req.user.id);
  }
}
