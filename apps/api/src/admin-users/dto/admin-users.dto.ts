import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../common/dto/transformers';

const MEMBERSHIP_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export class ActivateUserDto {
  @IsUUID()
  customerId!: string;

  @IsIn(MEMBERSHIP_ROLES)
  role!: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grantCustomerWorkspaces?: boolean;
}

export class UpsertMembershipDto {
  @IsUUID()
  customerId!: string;

  @IsIn(MEMBERSHIP_ROLES)
  role!: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grantCustomerWorkspaces?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  revokeCustomerPermissions?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ensureUserActive?: boolean;
}

export class PatchMembershipDto {
  @IsOptional()
  @IsIn(MEMBERSHIP_ROLES)
  role?: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grantCustomerWorkspaces?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  revokeCustomerPermissions?: boolean;
}

export class TransferMembershipDto {
  @IsUUID()
  fromCustomerId!: string;

  @IsUUID()
  toCustomerId!: string;

  @IsIn(MEMBERSHIP_ROLES)
  toRole!: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deactivateFrom?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  revokeFromCustomerPermissions?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grantToCustomerWorkspaces?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  toIsActive?: boolean;
}

export class RemoveMembershipQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  revokeCustomerPermissions?: boolean;
}

export class ListActiveUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  customerIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SetUserStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}
