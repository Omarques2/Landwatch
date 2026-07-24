import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

export class CreateTierDto {
  @IsUUID() proprietarioId!: string;
  @IsUUID() fazendaId!: string;
  @IsInt() @Min(0) @SexoQuantidadeValida() qtdMacho!: number;
  @IsInt() @Min(0) qtdFemea!: number;
  @IsInt() @Min(0) qtdIndefinido!: number;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsNotEmpty() @IsDateString() data!: string;
}
