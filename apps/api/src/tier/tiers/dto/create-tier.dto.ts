import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateTierDto {
  @IsUUID() proprietarioId!: string;
  @IsUUID() fazendaId!: string;
  @IsInt() @Min(1) qtdAnimais!: number;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsOptional() @IsDateString() data?: string;
}
