import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class RunGeeAnalysisDto {
  @IsIn(['image', 'deforestation'])
  operation!: 'image' | 'deforestation';

  @IsOptional()
  @IsUUID()
  farmId?: string;
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
