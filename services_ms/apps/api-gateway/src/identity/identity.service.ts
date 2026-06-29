import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class IdentityService {
  constructor(
    @Inject('IDENTITY_CLIENT') private readonly identityClient: ClientProxy,
  ) {}

  register(registerDto: any) {
    return this.identityClient.send('register', registerDto);
  }
  login(loginDto: any) {
    return this.identityClient.send('login', loginDto);
  }
  refresh(token: string) {
    return this.identityClient.send('refresh_token', token);
  }
  logout(token: string) {
    return this.identityClient.send('logout', token);
  }
  validateToken(token: string) {
    return this.identityClient.send('validate_token', token);
  }

  // --- Roles API proxy ---
  findAllRoles() {
    return this.identityClient.send('find_all_roles', {});
  }
  findOneRole(id: number) {
    return this.identityClient.send('find_one_role', id);
  }
  createRole(name: string) {
    return this.identityClient.send('create_role', { name });
  }
  updateRole(id: number, name: string) {
    return this.identityClient.send('update_role', { id, name });
  }
  deleteRole(id: number) {
    return this.identityClient.send('delete_role', id);
  }
  updateRolePermissions(roleId: number, permissions: string[]) {
    return this.identityClient.send('update_role_permissions', {
      roleId,
      permissions,
    });
  }

  updateUserRoles(userId: number, roles: string[]) {
    return this.identityClient.send('update_user_roles', { userId, roles });
  }

  // --- Permissions API proxy ---
  findAllPermissions() {
    return this.identityClient.send('find_all_permissions', {});
  }
  findOnePermission(id: number) {
    return this.identityClient.send('find_one_permission', id);
  }
}
