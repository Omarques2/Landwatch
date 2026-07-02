import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

// UF-1234567-<32 hex/alnum>. Mirrors the frontend/FornecedoresView CAR format.
const CAR_REGEX = /^[A-Z]{2}-\d{7}-[A-Z0-9]{32}$/;

export class GtaOrigemDto {
  @IsOptional() @IsString() nome?: string | null;
  @IsOptional() @IsString() cpfCnpj?: string | null;
  @IsOptional() @IsString() estabelecimento?: string | null;
  @IsOptional() @IsString() codigoEstabelecimento?: string | null;
  @IsOptional() @IsString() municipio?: string | null;
  @IsOptional() @IsString() uf?: string | null;
}

export class GenerateGtaAnalysisDto {
  @Matches(CAR_REGEX, { message: 'CAR inválido' })
  carKey!: string;

  @IsIn(['matched_with_car', 'matched_no_car', 'none'])
  matchKind!: 'matched_with_car' | 'matched_no_car' | 'none';

  @IsOptional() @IsString() @Length(1, 128)
  fornecedorId?: string;

  @IsOptional() @IsISO8601()
  analysisDate?: string;

  @IsOptional() @IsObject()
  origem?: GtaOrigemDto;
}
