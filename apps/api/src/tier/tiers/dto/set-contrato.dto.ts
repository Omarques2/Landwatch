import { IsNumberString, IsOptional } from 'class-validator';

export class SetTierContratoDto {
  @IsOptional() @IsNumberString() contratoValorAnimal?: string;
  @IsOptional() @IsNumberString() contratoValorAdicionalAprovado?: string;
}
