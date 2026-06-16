import { registerAs } from '@nestjs/config';

export const collabGatewayConfig = registerAs('collabGateway', () => ({
  port: parseInt(process.env.WS_PORT || '3008', 10),
  collabServiceHost: process.env.COLLAB_SERVICE_HOST || 'localhost',
  collabServicePort: parseInt(process.env.COLLAB_SERVICE_PORT || '3007', 10),
  identityServiceHost: process.env.IDENTITY_SERVICE_HOST || 'localhost',
  identityServicePort: parseInt(process.env.IDENTITY_SERVICE_PORT || '3002', 10),
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  roleCacheTtl: 300, // 5 minutes
}));
