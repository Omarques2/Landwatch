import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

export class AbateConsumoDto {
  @IsUUID() tierId!: string;
  @IsInt() @Min(1) qtdConsumida!: number;
}

export class CreateAbateDto {
  @IsUUID() proprietarioId!: string;
  @IsDateString() dataAbate!: string;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsInt() @Min(0) @SexoQuantidadeValida() qtdMacho!: number;
  @IsInt() @Min(0) qtdFemea!: number;
  @IsInt() @Min(0) qtdIndefinido!: number;
  // Optional and informational: owner credit is calculated from the abate total.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbateConsumoDto)
  consumos?: AbateConsumoDto[];
}
