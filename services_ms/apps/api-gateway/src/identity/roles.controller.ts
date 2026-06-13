import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { catchError, throwError } from 'rxjs';
import { JwtIdentityGuard } from './guards/jwt-identity.guard';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('identity/roles')
export class RolesController {
    constructor(private readonly identityService: IdentityService) { }

    @Get()
    @ApiOperation({ summary: 'Get all roles (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'Successfully retrieved roles.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    findAll() {
        return this.identityService.findAllRoles().pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
                )
            )
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single role by ID (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'Successfully retrieved the role.' })
    @ApiResponse({ status: 404, description: 'Role not found.' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.identityService.findOneRole(id).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? `Role with ID ${id} not found`, HttpStatus.NOT_FOUND)
                )
            )
        );
    }

    @Post()
    @ApiOperation({ summary: 'Create a new role (Requires Auth)' })
    @ApiResponse({ status: 201, description: 'Role created successfully.' })
    @ApiResponse({ status: 400, description: 'Validation failed or role already exists.' })
    create(@Body() createRoleDto: CreateRoleDto) {
        return this.identityService.createRole(createRoleDto.name).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to create role', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a role by ID (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'Role updated successfully.' })
    @ApiResponse({ status: 400, description: 'Failed to update role.' })
    @ApiResponse({ status: 404, description: 'Role not found.' })
    update(@Param('id', ParseIntPipe) id: number, @Body() updateRoleDto: UpdateRoleDto) {
        return this.identityService.updateRole(id, updateRoleDto.name).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to update role', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a role by ID (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'Role deleted successfully.' })
    @ApiResponse({ status: 404, description: 'Role not found.' })
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.identityService.deleteRole(id).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to delete role', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }

    @Patch(':id/permissions')
    @ApiOperation({ summary: 'Update permissions of a role (Requires Auth)' })
    @ApiResponse({ status: 200, description: 'Role permissions updated successfully.' })
    @ApiResponse({ status: 404, description: 'Role not found.' })
    updatePermissions(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRolePermissionsDto: UpdateRolePermissionsDto
    ) {
        return this.identityService.updateRolePermissions(id, updateRolePermissionsDto.permissions).pipe(
            catchError((err) =>
                throwError(
                    () => new HttpException(err?.message ?? 'Failed to update permissions', HttpStatus.BAD_REQUEST)
                )
            )
        );
    }
}
