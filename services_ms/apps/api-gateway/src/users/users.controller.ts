import {
    Controller, Get, Post, Patch, Delete, Param, Body,
    ParseIntPipe, HttpException, HttpStatus, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { catchError, throwError } from 'rxjs';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @ApiOperation({ summary: 'Get all user profiles (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'List of user profiles successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    findAll() {
        return this.usersService.findAll().pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
                )
            )
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single user profile by ID (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'User profile retrieved successfully.' })
    @ApiResponse({ status: 404, description: 'User profile not found.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.findOne(id).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'User profile not found', HttpStatus.NOT_FOUND)
                )
            )
        );
    }

    @Post()
    @ApiOperation({ summary: 'Create a new user profile (Requires Auth)' })
    @ApiResponse({ status: 201, description: 'User profile created successfully.' })
    @ApiResponse({ status: 400, description: 'Validation failed or profile already exists.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    create(@Body() createUserProfileDto: CreateUserProfileDto) {
        return this.usersService.create(createUserProfileDto).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to create user profile', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing user profile (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'User profile updated successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid data or update failed.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    update(@Param('id', ParseIntPipe) id: number, @Body() updateUserProfileDto: UpdateUserProfileDto) {
        return this.usersService.update(id, updateUserProfileDto).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to update user profile', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user profile by ID (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'User profile deleted successfully.' })
    @ApiResponse({ status: 400, description: 'Delete failed.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        if (req.user && req.user.id === id) {
            throw new HttpException('You cannot delete your own account', HttpStatus.BAD_REQUEST);
        }
        return this.usersService.remove(id, req.user.id).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to delete user profile', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }
}