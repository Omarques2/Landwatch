import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateProprietarioDto {
  @IsString() @Length(1, 200) nome!: string;
  @IsIn(['PF', 'PJ']) tipo!: 'PF' | 'PJ';
  @IsOptional() @IsString() @Length(1, 40) cpfCnpj?: string;
  @IsOptional() @IsString() @Length(1, 60) inscricaoEstadual?: string;
  @IsOptional() @IsString() @Length(1, 200) grupo?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(2, 2) estado?: string;
  @IsOptional() @IsNumberString() contratoValorAnimal?: string;
  @IsOptional() @IsNumberString() contratoValorAdicionalAprovado?: string;
}
