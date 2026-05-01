import { IsIn, IsString } from 'class-validator';

const orgRoleValues = ['owner', 'admin', 'member'] as const;

export class ManageMembershipDto {
  @IsString()
  userId!: string;

  @IsIn(orgRoleValues)
  role!: (typeof orgRoleValues)[number];
}
