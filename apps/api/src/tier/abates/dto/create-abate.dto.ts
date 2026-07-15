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
  @IsDateString() dataAbate!: string;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsInt() @Min(1) qtd!: number;
  // Optional: which tier(s) this abate consumed. Omitted => no ledger rows and
  // the abate does not affect any tier's saldo/credito.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbateConsumoDto)
  consumos?: AbateConsumoDto[];
}
