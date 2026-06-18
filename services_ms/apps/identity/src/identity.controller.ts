import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { IdentityService } from './identity.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // ─── HTTP endpoints (for collab-gateway and other HTTP clients) ──────────

  @Post('auth/verify')
  async httpVerifyToken(@Body() body: { token: string }) {
    return this.identityService.validateToken(body.token);
  }

  @Get('meetings/:meetingId/role')
  async httpGetMeetingRole(
    @Param('meetingId') meetingId: string,
    @Query('userId') userId: string,
  ) {
    // Delegates to identity service; in a real system this would query
    // the meeting-participants table. Here we return a default role.
    const role = await this.identityService.getMeetingRole(meetingId, Number(userId));
    return { role };
  }

  @Get('health')
  httpHealth() {
    return { status: 'ok', service: 'identity-service' };
  }

  @MessagePattern('register')
  async register(@Payload() registerDto: RegisterDto) {
    return this.identityService.register(registerDto);
  }

  @MessagePattern('login')
  async login(@Payload() loginDto: LoginDto) {
    return this.identityService.login(loginDto);
  }

  @MessagePattern('refresh_token')
  async refresh(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.refresh(token);
  }

  @MessagePattern('logout')
  async logout(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.logout(token);
  }

  @MessagePattern('validate_token')
  async validateToken(@Payload() payload: { token: string } | string) {
    const token = typeof payload === 'string' ? payload : payload.token;
    return this.identityService.validateToken(token);
  }

  // --- Roles TCP endpoints ---
  @MessagePattern('find_all_roles')
  async findAllRoles() {
    return this.identityService.findAllRoles();
  }

  @MessagePattern('find_one_role')
  async findOneRole(@Payload() id: number) {
    return this.identityService.findOneRole(id);
  }

  @MessagePattern('create_role')
  async createRole(@Payload() data: { name: string }) {
    return this.identityService.createRole(data.name);
  }

  @MessagePattern('update_role')
  async updateRole(@Payload() data: { id: number; name: string }) {
    return this.identityService.updateRole(data.id, data.name);
  }

  @MessagePattern('delete_role')
  async deleteRole(@Payload() id: number) {
    return this.identityService.deleteRole(id);
  }

  @MessagePattern('delete_account')
  async deleteAccount(@Payload() data: { id: number; requesterId?: number }) {
    return this.identityService.deleteAccount(
      Number(data.id),
      data.requesterId ? Number(data.requesterId) : undefined,
    );
  }

  @MessagePattern('update_role_permissions')
  async updateRolePermissions(
    @Payload() data: { roleId: number; permissions: string[] },
  ) {
    return this.identityService.updateRolePermissions(
      data.roleId,
      data.permissions,
    );
  }

  @MessagePattern('update_user_roles')
  async updateUserRoles(@Payload() data: { userId: number; roles: string[] }) {
    return this.identityService.updateUserRoles(data.userId, data.roles);
  }

  // --- Permissions TCP endpoints ---
  @MessagePattern('find_all_permissions')
  async findAllPermissions() {
    return this.identityService.findAllPermissions();
  }

  @MessagePattern('find_one_permission')
  async findOnePermission(@Payload() id: number) {
    return this.identityService.findOnePermission(id);
  }
}
