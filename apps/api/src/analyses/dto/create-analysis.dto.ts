import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateAnalysisDto {
  @IsString()
  @Length(5, 200)
  carKey!: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  cpfCnpj?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  farmName?: string;

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;
}
