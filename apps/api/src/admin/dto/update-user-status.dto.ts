import { IsIn, IsOptional, IsString } from 'class-validator';

const userStatusValues = ['active', 'disabled'] as const;
const orgRoleValues = ['owner', 'admin', 'member'] as const;

export class UpdateUserStatusDto {
  @IsIn(userStatusValues)
  status!: (typeof userStatusValues)[number];

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsIn(orgRoleValues)
  role?: (typeof orgRoleValues)[number];
}
