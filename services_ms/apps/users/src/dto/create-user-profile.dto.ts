import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateUserProfileDto {
  @IsNumber()
  @IsNotEmpty()
  id: number; // ID đồng bộ từ Account.id bên Identity Service

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;
}
