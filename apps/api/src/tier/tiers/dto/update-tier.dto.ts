import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

// General edits only. Status is changed via POST :id/status, contract via
// PUT :id/contrato. Proprietario/fazenda are immutable after creation (the
// contract snapshot depends on the proprietario).
export class UpdateTierDto {
  @IsOptional() @IsInt() @Min(1) qtdAnimais?: number;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsOptional() @IsDateString() data?: string;
}
