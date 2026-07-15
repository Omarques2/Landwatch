import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListTiersQuery {
  @IsOptional() @IsUUID() proprietarioId?: string;
  @IsOptional() @IsUUID() fazendaId?: string;
  @IsOptional() @IsIn(['SUBMETIDO', 'APROVADO', 'RECUSADO']) status?:
    | 'SUBMETIDO'
    | 'APROVADO'
    | 'RECUSADO';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
