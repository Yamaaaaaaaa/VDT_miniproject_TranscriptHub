import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { catchError, throwError } from 'rxjs';
import { JwtIdentityGuard } from './guards/jwt-identity.guard';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('identity/permissions')
export class PermissionsController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @ApiOperation({ summary: 'Get all permissions (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved permissions.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findAll() {
    return this.identityService
      .findAllPermissions()
      .pipe(
        catchError((err) =>
          throwError(
            () =>
              new HttpException(
                err?.message ?? 'Internal server error',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
          ),
        ),
      );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single permission by ID (Requires Auth)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the permission.',
  })
  @ApiResponse({ status: 404, description: 'Permission not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.identityService
      .findOnePermission(id)
      .pipe(
        catchError((err) =>
          throwError(
            () =>
              new HttpException(
                err?.message ?? `Permission with ID ${id} not found`,
                HttpStatus.NOT_FOUND,
              ),
          ),
        ),
      );
  }
}
