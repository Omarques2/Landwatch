import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListGtaPendenciasQuery {
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

  @IsOptional()
  @IsEnum(['PENDENTE', 'RESOLVIDO'])
  status?: 'PENDENTE' | 'RESOLVIDO';

  @IsOptional()
  @IsString()
  motivo?: string;
}
