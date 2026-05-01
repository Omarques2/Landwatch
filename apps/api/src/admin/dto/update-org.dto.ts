import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const orgStatusValues = ['active', 'disabled'] as const;

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsIn(orgStatusValues)
  status?: (typeof orgStatusValues)[number];
}
