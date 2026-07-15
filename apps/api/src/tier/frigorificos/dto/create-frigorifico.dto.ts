import {
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateFrigorificoDto {
  @IsString() @Length(1, 200) nome!: string;
  @IsOptional() @IsString() @Length(1, 60) inscricaoEstadual?: string;
  @IsOptional() @IsString() @Length(1, 40) cpfCnpj?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(1, 400) endereco?: string;
  @IsOptional() @IsNumberString() lat?: string;
  @IsOptional() @IsNumberString() lon?: string;
  @IsOptional() @IsUUID() grupoId?: string;
}

export class UpdateFrigorificoDto {
  @IsOptional() @IsString() @Length(1, 200) nome?: string;
  @IsOptional() @IsString() @Length(1, 60) inscricaoEstadual?: string;
  @IsOptional() @IsString() @Length(1, 40) cpfCnpj?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(1, 400) endereco?: string;
  @IsOptional() @IsNumberString() lat?: string;
  @IsOptional() @IsNumberString() lon?: string;
  @IsOptional() @IsUUID() grupoId?: string;
}
