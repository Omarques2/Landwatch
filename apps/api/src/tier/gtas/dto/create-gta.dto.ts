import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateGtaDto {
  @IsString() @Length(1, 60) numero!: string;
  @IsOptional() @IsDateString() dataEmissao?: string;
  @IsOptional() @IsUUID() origemFazendaId?: string;
  @IsOptional() @IsInt() @Min(1) qtd?: number;
  @IsOptional() @IsString() @Length(1, 20) sexo?: string;
}

export class UpdateGtaDto {
  @IsOptional() @IsString() @Length(1, 60) numero?: string;
  @IsOptional() @IsDateString() dataEmissao?: string;
  @IsOptional() @IsUUID() origemFazendaId?: string;
  @IsOptional() @IsInt() @Min(1) qtd?: number;
  @IsOptional() @IsString() @Length(1, 20) sexo?: string;
}
