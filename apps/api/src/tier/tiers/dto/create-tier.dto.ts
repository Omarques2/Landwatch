import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTierDto {
  @IsUUID() proprietarioId!: string;
  @IsUUID() fazendaId!: string;
  @IsInt() @Min(1) qtdAnimais!: number;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsNotEmpty() @IsDateString() data!: string;
}
