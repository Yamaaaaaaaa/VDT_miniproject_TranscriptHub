import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtIdentityGuard } from './guards/jwt-identity.guard';

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or email already exists.',
  })
  register(@Body() registerDto: RegisterDto) {
    return this.identityService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 201,
    description: 'Successfully authenticated, returns tokens.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() loginDto: LoginDto) {
    return this.identityService.login(loginDto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 201, description: 'Returns a new access token.' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token.',
  })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.identityService.refresh(refreshTokenDto.token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 201, description: 'Successfully logged out.' })
  @ApiResponse({ status: 400, description: 'Logout failed.' })
  logout(@Body() logoutDto: LogoutDto) {
    return this.identityService.logout(logoutDto.token);
  }

  @ApiBearerAuth()
  @UseGuards(JwtIdentityGuard)
  @Patch('users/:id/roles')
  @ApiOperation({ summary: 'Update roles of a user (Requires Auth)' })
  @ApiResponse({ status: 200, description: 'User roles updated successfully.' })
  @ApiResponse({ status: 400, description: 'Failed to update user roles.' })
  updateUserRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { roles: string[] },
  ) {
    return this.identityService.updateUserRoles(id, body.roles);
  }
}
