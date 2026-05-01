import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;
}
