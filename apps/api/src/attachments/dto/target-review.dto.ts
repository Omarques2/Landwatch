import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TargetReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  reason?: string;
}
