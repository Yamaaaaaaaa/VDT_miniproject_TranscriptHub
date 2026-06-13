import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateUserProfileDto {
    @ApiProperty({
        description: 'Account ID associated with this user profile (synced from Identity Service)',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    id: number;

    @ApiProperty({
        description: 'Full name of the user',
        example: 'John Doe',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Email address of the user',
        example: 'john.doe@example.com',
    })
    @IsEmail()
    email: string;
}