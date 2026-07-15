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

export class AbateConsumoDto {
  @IsUUID() tierId!: string;
  @IsInt() @Min(1) qtdConsumida!: number;
}

export class CreateAbateDto {
  @IsUUID() proprietarioId!: string;
  @IsDateString() dataAbate!: string;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsInt() @Min(1) qtd!: number;
  // Optional and informational: owner credit is calculated from the abate total.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbateConsumoDto)
  consumos?: AbateConsumoDto[];
}
