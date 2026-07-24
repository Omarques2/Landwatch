import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SexoQuantidadeValida } from '../../common/sexo-quantidade';

// General edits only. Status is changed via POST :id/status, contract via
// PUT :id/contrato. Proprietario/fazenda are immutable after creation (the
// contract snapshot depends on the proprietario). Sexo quantities are edited
// as a group (all three together) or not at all.
export class UpdateTierDto {
  @IsOptional() @IsInt() @Min(0) @SexoQuantidadeValida() qtdMacho?: number;
  @IsOptional() @IsInt() @Min(0) qtdFemea?: number;
  @IsOptional() @IsInt() @Min(0) qtdIndefinido?: number;
  @IsOptional() @IsUUID() frigorificoId?: string;
  @IsOptional() @IsDateString() data?: string;
}
