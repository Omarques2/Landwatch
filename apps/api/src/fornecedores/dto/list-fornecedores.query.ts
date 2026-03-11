import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListFornecedoresQuery {
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
  @IsEnum([
    'nome',
    'cpfCnpj',
    'municipio',
    'uf',
    'createdAt',
    'updatedAt',
    'gtaPendentes',
  ])
  sortBy?:
    | 'nome'
    | 'cpfCnpj'
    | 'municipio'
    | 'uf'
    | 'createdAt'
    | 'updatedAt'
    | 'gtaPendentes';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  idFornecedor?: string;

  @IsOptional()
  @IsString()
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  estabelecimento?: string;

  @IsOptional()
  @IsString()
  codigoEstabelecimento?: string;

  @IsOptional()
  @IsString()
  municipio?: string;

  @IsOptional()
  @IsString()
  uf?: string;

  @IsOptional()
  @IsString()
  car?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  hasCar?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeZeroPendencias?: boolean;
}
