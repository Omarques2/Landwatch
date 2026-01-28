import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class GrantPlatformAdminDto {
  @IsOptional()
  @IsString()
  appKey?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEmail()
  userEmail?: string;
}

export class RevokePlatformAdminQueryDto {
  @IsOptional()
  @IsString()
  appKey?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;
}
